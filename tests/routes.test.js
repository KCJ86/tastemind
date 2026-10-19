const { describe, test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  pool,
  initDb,
  resetDb,
  nextIp,
  send,
  signup,
} = require("./helpers");

before(async () => {
  await initDb();
});
after(async () => {
  await pool.end();
});

const restaurant = (name) => ({
  place_id: `place_${name}`,
  restaurant_name: name,
  cuisine_type: "Ramen",
  price_level: 2,
  address: "123 Test St",
});

const saveVisit = async (cookie, name) => {
  const res = await send("post", "/api/v1/recommendations/save", {
    cookie,
    body: restaurant(name),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.visit_id;
};

const visitOwner = async (visitId) =>
  (await pool.query("SELECT user_id FROM visits WHERE id = $1", [visitId]))
    .rows[0]?.user_id;

describe("visit isolation between users", () => {
  let alice;
  let bob;
  let bobVisit;

  beforeEach(async () => {
    await resetDb();
    alice = await signup({ username: "alice", name: "Alice" });
    bob = await signup({ username: "bob", name: "Bob" });
    bobVisit = await saveVisit(bob.cookie, "Bob's Ramen");
  });

  test("a user's visit list never includes another user's visits", async () => {
    const aliceVisit = await saveVisit(alice.cookie, "Alice's Pho");

    const aliceList = await send("get", "/api/v1/users/me/visits", { cookie: alice.cookie });
    assert.equal(aliceList.status, 200);
    assert.deepEqual(aliceList.body.visits.map((v) => v.id), [aliceVisit]);

    const bobList = await send("get", "/api/v1/users/me/visits", { cookie: bob.cookie });
    assert.deepEqual(bobList.body.visits.map((v) => v.id), [bobVisit]);
  });

  test("a user can't rate another user's visit", async () => {
    const res = await send("post", `/api/v1/users/me/visits/${bobVisit}/rate`, {
      cookie: alice.cookie,
      body: { rating: 1, notes: "planted review" },
    });
    assert.equal(res.status, 404);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM ratings WHERE visit_id = $1",
      [bobVisit],
    );
    assert.equal(rows[0].n, 0);
    // Nothing was embedded into Bob's RAG context either.
    const emb = await pool.query(
      "SELECT count(*)::int AS n FROM review_embeddings WHERE visit_id = $1",
      [bobVisit],
    );
    assert.equal(emb.rows[0].n, 0);
  });

  test("a user can rate their own visit, and the review is indexed for them", async () => {
    const res = await send("post", `/api/v1/users/me/visits/${bobVisit}/rate`, {
      cookie: bob.cookie,
      body: { rating: 5, notes: "rich broth" },
    });
    assert.equal(res.status, 200);
    const { rows } = await pool.query(
      "SELECT user_id FROM review_embeddings WHERE visit_id = $1",
      [bobVisit],
    );
    assert.deepEqual(rows, [{ user_id: bob.user.id }]);
  });

  test("a user can't save a visit into another user's account", async () => {
    // A user_id in the body must be ignored; only the session decides.
    const res = await send("post", "/api/v1/recommendations/save", {
      cookie: alice.cookie,
      body: {
        ...restaurant("Sneaky Sushi"),
        user_id: bob.user.id,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(await visitOwner(res.body.visit_id), alice.user.id);

    const bobList = await send("get", "/api/v1/users/me/visits", { cookie: bob.cookie });
    assert.deepEqual(bobList.body.visits.map((v) => v.id), [bobVisit]);
  });

  test("updating location only changes the signed-in user", async () => {
    const res = await send("patch", "/api/v1/users/me/location", {
      cookie: alice.cookie,
      body: { location: "Portland, OR" },
    });
    assert.equal(res.status, 200);
    const { rows } = await pool.query(
      "SELECT username, location FROM users ORDER BY id",
    );
    assert.deepEqual(rows, [
      { username: "alice", location: "Portland, OR (resolved)" },
      { username: "bob", location: "San Diego, CA" },
    ]);
  });

  test("updating taste only changes the signed-in user", async () => {
    const res = await send("patch", "/api/v1/users/me/taste", {
      cookie: alice.cookie,
      body: { liked_cuisines: ["Thai"] },
    });
    assert.equal(res.status, 200);
    const { rows } = await pool.query(
      `SELECT u.username, tp.liked_cuisines FROM taste_profiles tp
       JOIN users u ON u.id = tp.user_id ORDER BY u.id`,
    );
    assert.deepEqual(rows, [
      { username: "alice", liked_cuisines: '["Thai"]' },
      { username: "bob", liked_cuisines: "[]" },
    ]);
  });
});

describe("routes require a session", () => {
  const ROUTES = [
    ["get", "/api/v1/auth/me"],
    ["get", "/api/v1/users/me/visits"],
    ["patch", "/api/v1/users/me/taste", { liked_cuisines: ["Thai"] }],
    ["post", "/api/v1/users/me/visits/1/rate", { rating: 5 }],
    ["patch", "/api/v1/users/me/location", { location: "Portland, OR" }],
    ["post", "/api/v1/recommendations", { craving: "ramen" }],
    ["post", "/api/v1/recommendations/save", restaurant("Nowhere")],
  ];

  before(async () => {
    await resetDb();
  });

  for (const [method, path, body] of ROUTES) {
    test(`${method.toUpperCase()} ${path} → 401 with no session`, async () => {
      const res = await send(method, path, { body });
      assert.equal(res.status, 401);
    });

    test(`${method.toUpperCase()} ${path} → 401 with a forged session cookie`, async () => {
      const res = await send(method, path, {
        body,
        cookie: `tm_session=${"0".repeat(64)}`,
      });
      assert.equal(res.status, 401);
    });
  }
});

describe("old per-user routes are gone", () => {
  before(async () => {
    await resetDb();
  });

  const OLD_ROUTES = [
    ["get", "/api/v1/users/elise_ab12"],
    ["get", "/api/v1/users/elise_ab12/visits"],
    ["patch", "/api/v1/users/elise_ab12/taste", { liked_cuisines: ["Thai"] }],
    ["patch", "/api/v1/users/elise_ab12/location", { location: "Portland, OR" }],
    ["post", "/api/v1/users", { name: "New", location: "San Diego, CA" }],
  ];

  for (const [method, path, body] of OLD_ROUTES) {
    test(`${method.toUpperCase()} ${path} doesn't work without a session`, async () => {
      const res = await send(method, path, { body });
      assert.equal(res.status, 401);
    });

    test(`${method.toUpperCase()} ${path} doesn't exist even with a session`, async () => {
      const { cookie } = await signup({ username: `probe${nextIp().replace(/\./g, "")}` });
      const res = await send(method, path, { body, cookie });
      assert.equal(res.status, 404);
    });
  }
});

describe("AI rate limit is per user", () => {
  before(async () => {
    await resetDb();
  });

  test("10 requests a minute per user, regardless of IP; other users unaffected", async () => {
    const alice = await signup({ username: "alice_rl" });
    const bob = await signup({ username: "bob_rl" });
    const sharedIp = nextIp();

    for (let i = 0; i < 10; i++) {
      // A different IP each time: switching networks mustn't reset the count.
      const res = await send("post", "/api/v1/recommendations/save", {
        cookie: alice.cookie,
        body: restaurant(`Place ${i}`),
      });
      assert.equal(res.status, 201);
    }
    const blocked = await send("post", "/api/v1/recommendations/save", {
      cookie: alice.cookie,
      body: restaurant("One too many"),
      ip: sharedIp,
    });
    assert.equal(blocked.status, 429);

    // Bob, on the same IP Alice was just blocked from, is unaffected.
    const bobRes = await send("post", "/api/v1/recommendations/save", {
      cookie: bob.cookie,
      body: restaurant("Bob's place"),
      ip: sharedIp,
    });
    assert.equal(bobRes.status, 201);
  });
});
