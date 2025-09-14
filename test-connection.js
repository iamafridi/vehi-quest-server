// test-connection.js
const { MongoClient } = require("mongodb");
require("dotenv").config();

async function testConnection() {
  console.log("🔍 Testing MongoDB connection...");
  console.log("DB_USER:", process.env.DB_USER ? "✓ Set" : "❌ Missing");
  console.log("DB_PASS:", process.env.DB_PASS ? "✓ Set" : "❌ Missing");

  if (!process.env.DB_USER || !process.env.DB_PASS) {
    console.error("❌ Missing database credentials in .env file");
    return;
  }

  const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7grn8zj.mongodb.net/?retryWrites=true&w=majority`;

  console.log(
    "🔗 Connection URI (credentials hidden):",
    uri.replace(/:([^:@]+)@/, ":***@")
  );

  const client = new MongoClient(uri, {
    connectTimeoutMS: 10000, // 10 seconds
    serverSelectionTimeoutMS: 10000, // 10 seconds
    socketTimeoutMS: 10000, // 10 seconds
  });

  try {
    console.log("⏳ Attempting to connect...");
    await client.connect();

    console.log("✅ Connected successfully!");

    // Test ping
    await client.db("admin").command({ ping: 1 });
    console.log("🏓 Ping successful!");

    // List databases
    const dbs = await client.db().admin().listDatabases();
    console.log(
      "📊 Available databases:",
      dbs.databases.map((db) => db.name)
    );
  } catch (error) {
    console.error("❌ Connection failed:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);

    if (error.message.includes("ETIMEDOUT")) {
      console.log("\n🔧 This is a network timeout error. Try these fixes:");
      console.log("1. Check MongoDB Atlas Network Access settings");
      console.log("2. Add your current IP address to whitelist");
      console.log("3. Try temporarily allowing 0.0.0.0/0 (all IPs)");
      console.log("4. Check your internet connection");
      console.log(
        "5. Try connecting from a different network (mobile hotspot)"
      );
    }

    if (error.message.includes("authentication failed")) {
      console.log("\n🔧 This is an authentication error:");
      console.log("1. Double-check your DB_USER and DB_PASS in .env");
      console.log("2. Make sure the user exists in MongoDB Atlas");
      console.log("3. Verify the user has database access permissions");
    }
  } finally {
    await client.close();
    console.log("🔌 Connection closed");
  }
}

// Run the test
testConnection().catch(console.error);
