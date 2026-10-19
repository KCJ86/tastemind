const { describe, test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  pool,
  initDb,
  resetDb,
  nextIp,
  post,
  get,
  sessionCookie,
  signup,
  createLegacyUser,
  PASSWORD,
} = require("./helpers");

before(async () => {
  await initDb();
});
beforeEach(async () => {
  await resetDb();
});
after(async () => {
  await pool.end();
});

describe("signup", () => {
  test("creates an account, sets an httpOnly session cookie, never returns the hash", async () => {
    const res = await post("/api/v1/auth/signup", {
      name: "Kennedy",
      username: "Kennedy_J",
      password: PASSWORD,
      location: "San Diego, CA",
      email: "Kennedy@Example.com",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, "kennedy_j");
    assert.equal(res.body.user.email, "kennedy@example.com");
    assert.equal("password_hash" in res.body.user, false);

    const raw = res.headers["set-cookie"].find((c) => c.startsWith("tm_session="));
    assert.match(raw, /HttpOnly/);
    assert.match(raw, /SameSite=Lax/);

    const me = await get("/api/v1/auth/me", sessionCookie(res));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, res.body.user.id);
    assert.equal("password_hash" in me.body.user, false);
  });

  test("rejects a username that differs only by case", async () => {
    await signup({ username: "tester" });
    const res = await post("/api/v1/auth/signup", {
      name: "Other",
      username: "TESTER",
      password: PASSWORD,
      location: "San Diego, CA",
    });
    assert.equal(res.status, 409);
  });

  test("rejects passwords that are too short or over bcrypt's 72-byte limit", async () => {
    for (const password of ["short", "a".repeat(73)]) {
      const res = await post("/api/v1/auth/signup", {
        name: "X",
        username: "pwtest",
        password,
        location: "San Diego, CA",
      });
      assert.equal(res.status, 400, `password of length ${password.length}`);
    }
  });
});

describe("login", () => {
  test("correct credentials start a session", async () => {
    await signup({ username: "tester" });
    const res = await post("/api/v1/auth/login", {
      username: "Tester",
      password: PASSWORD,
    });
    assert.equal(res.status, 200);
    assert.ok(sessionCookie(res));
  });

  // Tests that make failed logins use their own username: the per-username
  // limiter's count lives in memory for the whole test file.
  test("wrong username and wrong password give the same 401", async () => {
    await signup({ username: "wrongpw" });
    const wrongUser = await post("/api/v1/auth/login", {
      username: "nobody",
      password: PASSWORD,
    });
    const wrongPassword = await post("/api/v1/auth/login", {
      username: "wrongpw",
      password: "wrong password!!",
    });

    assert.equal(wrongUser.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongUser.body, wrongPassword.body);
    assert.equal(sessionCookie(wrongUser), null);
    assert.equal(sessionCookie(wrongPassword), null);
  });

  test("an unclaimed legacy account can't log in", async () => {
    await createLegacyUser("legacy_ab12");
    const res = await post("/api/v1/auth/login", {
      username: "legacy_ab12",
      password: PASSWORD,
    });
    assert.equal(res.status, 401);
  });

  test("locks a username after 5 failures, even from different IPs", async () => {
    await signup({ username: "lockme" });
    for (let i = 0; i < 5; i++) {
      const res = await post("/api/v1/auth/login", {
        username: "lockme",
        password: "wrong password!!",
      });
      assert.equal(res.status, 401);
    }
    const blocked = await post("/api/v1/auth/login", {
      username: "lockme",
      password: PASSWORD,
    });
    assert.equal(blocked.status, 429);
  });

  test("locks an IP after 10 failures across usernames", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) {
      const res = await post(
        "/api/v1/auth/login",
        { username: `nobody${i}`, password: "wrong password!!" },
        ip,
      );
      assert.equal(res.status, 401);
    }
    const blocked = await post(
      "/api/v1/auth/login",
      { username: "someone_else", password: "wrong password!!" },
      ip,
    );
    assert.equal(blocked.status, 429);
  });
});

describe("logout", () => {
  test("invalidates the session, so the old cookie stops working", async () => {
    const { cookie } = await signup();
    assert.equal((await get("/api/v1/auth/me", cookie)).status, 200);

    const res = await post("/api/v1/auth/logout", {}).set("Cookie", cookie);
    assert.equal(res.status, 200);

    // Replaying the old cookie (as if it had been stolen) must fail.
    assert.equal((await get("/api/v1/auth/me", cookie)).status, 401);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM sessions");
    assert.equal(rows[0].n, 0);
  });

  test("only ends that session, not the user's other ones", async () => {
    const { cookie: first } = await signup({ username: "tester" });
    const second = sessionCookie(
      await post("/api/v1/auth/login", { username: "tester", password: PASSWORD }),
    );
    await post("/api/v1/auth/logout", {}).set("Cookie", first);
    assert.equal((await get("/api/v1/auth/me", first)).status, 401);
    assert.equal((await get("/api/v1/auth/me", second)).status, 200);
  });
});

describe("claim", () => {
  const claim = (body, ip) =>
    post(
      "/api/v1/auth/claim",
      { username: "claimer", password: PASSWORD, ...body },
      ip,
    );

  test("upgrades a legacy account in place and signs the user in", async () => {
    const id = await createLegacyUser("elise_ab12", "Elise");
    const res = await claim({ user_code: "elise_ab12" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, id); // same account, so history is kept
    assert.equal(res.body.user.username, "claimer");
    assert.equal(res.body.user.user_code, null);
    assert.equal((await get("/api/v1/auth/me", sessionCookie(res))).status, 200);

    const login = await post("/api/v1/auth/login", {
      username: "claimer",
      password: PASSWORD,
    });
    assert.equal(login.status, 200);
  });

  test("a claimed code can't be reused", async () => {
    await createLegacyUser("elise_ab12");
    assert.equal((await claim({ user_code: "elise_ab12" })).status, 200);

    const again = await claim({ user_code: "elise_ab12", username: "attacker" });
    assert.equal(again.status, 401);
    assert.equal(sessionCookie(again), null);

    // The original owner's credentials are untouched.
    const { rows } = await pool.query(
      "SELECT username FROM users WHERE username IS NOT NULL",
    );
    assert.deepEqual(rows, [{ username: "claimer" }]);
  });

  test("an unknown code gets the same 401 as a reused one", async () => {
    await createLegacyUser("elise_ab12");
    await claim({ user_code: "elise_ab12" });
    const reused = await claim({ user_code: "elise_ab12", username: "attacker" });
    const unknown = await claim({ user_code: "nobody_0000", username: "attacker" });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, reused.body);
  });

  test("a taken username gives the same 409 whether or not the code is valid", async () => {
    await signup({ username: "taken" });
    await createLegacyUser("elise_ab12");
    const valid = await claim({ user_code: "elise_ab12", username: "taken" });
    const invalid = await claim({ user_code: "nobody_0000", username: "taken" });
    assert.equal(valid.status, 409);
    assert.deepEqual(valid.body, invalid.body);

    // The valid code was not consumed by the failed attempt.
    assert.equal((await claim({ user_code: "elise_ab12" })).status, 200);
  });

  test("is closed 30 days after the window opened", async () => {
    await createLegacyUser("elise_ab12");
    await pool.query(
      `UPDATE app_settings SET value = (NOW() - INTERVAL '31 days')::text
       WHERE key = 'claim_opens_at'`,
    );
    const res = await claim({ user_code: "elise_ab12" });
    assert.equal(res.status, 410);
  });

  test("allows 5 attempts per IP per hour", async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      assert.equal((await claim({ user_code: `guess_${i}` }, ip)).status, 401);
    }
    assert.equal((await claim({ user_code: "guess_5" }, ip)).status, 429);
  });
});

describe("CSRF origin check", () => {
  test("rejects a state-changing request from another site", async () => {
    await signup({ username: "tester" });
    const res = await post("/api/v1/auth/login", {
      username: "tester",
      password: PASSWORD,
    }).set("Origin", "https://evil.example");
    assert.equal(res.status, 403);
  });

  test("allows the app's own origin", async () => {
    await signup({ username: "tester" });
    const res = await post("/api/v1/auth/login", {
      username: "tester",
      password: PASSWORD,
    }).set("Origin", "http://localhost:3000");
    assert.equal(res.status, 200);
  });
});
