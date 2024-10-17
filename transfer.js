const dotenv = require("dotenv");
dotenv.config();

const { MongoClient } = require("mongodb");

async function migrateData() {
  const localClient = await MongoClient.connect("mongodb://localhost:27017");
  const atlasClient = await MongoClient.connect(process.env.MONGODB_CONNECTION);

  const localDb = localClient.db("qrcodeDB");
  const atlasDb = atlasClient.db("qrcodeDB");

  const collections = await localDb.listCollections().toArray();

  for (let collection of collections) {
    const localCollection = localDb.collection(collection.name);
    const atlasCollection = atlasDb.collection(collection.name);

    const data = await atlasCollection.find({}).toArray();
    console.log("atlasCollectiondata", data);
    if (data.length > 0) {
      await atlasCollection.insertMany(data);
    }
  }

  await localClient.close();
  await atlasClient.close();
}
// migrateData();

migrateData().catch(console.error);
