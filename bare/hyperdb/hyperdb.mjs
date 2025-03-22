import HyperDB from "hyperdb";
import Hyperswarm from "hyperswarm";
import Corestore from "corestore";
import db from "./spec/db/index.js";

console.log("Hyperdb Worklet started");

function time() {
  return Math.floor(Date.now() / 1000);
}

const path =
  Bare.argv[0] === "android"
    ? "/data/data/to.holepunch.bare.doctor/bare-mobile-doctor"
    : "./tmp/bare-mobile-doctor";

BareKit.IPC.on("data", async (data) => {
  const local = HyperDB.rocks(path, db);
  let id = 0;

  const message = data.toString();
  const payload = JSON.parse(message);

  if (payload.workType === "intensive") {
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert("@hyperdb-example/user", {
        id: i + 1,
        name: `data-${i + 1}-${time()}`,
      });
      await local.flush(); // Persist changes
      id++;
    }

    let result = await local.find(
      "@hyperdb-example/user",
      { reverse: true },
      { limit: 1 },
    ); // list only one due to limit
    result = await result.toArray();
    await local.close(); // close the db
    BareKit.IPC.write(JSON.stringify(result));
  } else if (payload.workType === "hyperbee") {
    const topic = Buffer.alloc(32).fill(time());
    const localCorestore = new Corestore(path + `/${time()}/local.db`);

    const a = localCorestore.get({ name: "local" });

    const local = HyperDB.bee(a, db, { autoUpdate: true });
    await local.ready();

    const bootstrapKey = local.core.key; // we will bootstrap peer core from this key
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert("@hyperdb-example/user", {
        id: i + 1,
        name: `data-${i + 1}-${time()}`,
      });
      await local.flush(); // Persist changes
      id++;
    }

    // Create a new hyperswarm
    const localSwarm = new Hyperswarm();

    localSwarm.on("connection", async (conn) => {
      localCorestore.replicate(conn); // replicate local core across all peers
    });
    const swarm1 = localSwarm.join(topic);

    // Storage for second peer
    const remoteCorestore = new Corestore(path + `/${time()}/remote.db`);
    // Use the first peer's bootstrap key to create this hypercore
    const b = remoteCorestore.get({ key: bootstrapKey });

    const remote = HyperDB.bee(b, db, { autoUpdate: true });
    await remote.ready();

    const remoteSwarm = new Hyperswarm();
    remoteSwarm.on("connection", async (conn) => {
      remoteCorestore.replicate(conn);
    });

    const swarm2 = remoteSwarm.join(topic);

    // Watch for db updates
    const watcher = remote.db.watch();
    watcher.on("update", async () => {
      let result = await remote.find(
        "@hyperdb-example/user",
        { reverse: true },
        { limit: 1 },
      );
      result = await result.toArray();

      if (result[0].id === payload.recordsAmount) {
        BareKit.IPC.write(JSON.stringify(result));
        await localCorestore.close();
        await remoteCorestore.close();
        await swarm1.destroy();
        await swarm2.destroy();
      }
    });
  } else if (payload.workType === "hyperbee-local") {
    const localCorestore = new Corestore(path + `/${time()}/local.db`);

    const a = localCorestore.get({ name: "local" });

    const local = HyperDB.bee(a, db, { autoUpdate: true });
    await local.ready();
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert("@hyperdb-example/user", {
        id: i + 1,
        name: `data-${i + 1}-${time()}`,
      });
      await local.flush(); // Persist changes
      id++;
    }

    let result = await local.find(
      "@hyperdb-example/user",
      { reverse: true },
      { limit: 1 },
    );
    result = await result.toArray();

    if (result[0].id === payload.recordsAmount) {
      await localCorestore.close();
      BareKit.IPC.write(JSON.stringify(result));
    }
  } else if (payload.workType === "basic") {
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert("@hyperdb-example/user", {
        id: i + 1,
        name: `data-${i + 1}-${time()}`,
      });
      id++;
    }
    await local.flush(); // Flush only once after writing all the records
    let result = await local.find(
      "@hyperdb-example/user",
      { reverse: true },
      { limit: 1 },
    );
    result = await result.toArray();
    await local.close();
    BareKit.IPC.write(JSON.stringify(result));
  }
});
