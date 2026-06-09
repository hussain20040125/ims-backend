import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/inventory_db';

const COMPANIES = [
  { name: "GLR Real Estate Private Limited", gstin: "", address: "" },
  { name: "Neoteric Housing India LLP", gstin: "", address: "" },
  { name: "Heaven Heights Private Limited", gstin: "", address: "" },
  { name: "Gravity Infrastructures Private Limited", gstin: "", address: "" },
  { name: "RLG Care Foundation", gstin: "", address: "" },
  { name: "Swastik Grah Nirman Company", gstin: "", address: "" },
  { name: "Neoteric Recreational And Hospitality", gstin: "", address: "" }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  const db = mongoose.connection.db;
  const settingsColl = db.collection('settings');
  
  const settings = await settingsColl.findOne({});
  if (!settings) {
    console.log("No settings found, creating one");
    await settingsColl.insertOne({ companies: COMPANIES });
  } else {
    // If companies is empty or missing, populate it
    if (!settings.companies || settings.companies.length === 0) {
      console.log("Populating companies");
      await settingsColl.updateOne({ _id: settings._id }, { $set: { companies: COMPANIES } });
    } else {
      console.log("Companies already exist, doing nothing.");
    }
  }

  console.log("Done");
  process.exit(0);
}

seed().catch(console.error);
