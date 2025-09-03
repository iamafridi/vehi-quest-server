const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require("nodemailer");

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    message: "Too many authentication attempts, please try again later",
  },
});

// Email validation helper
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Input validation helper
const validateVehicleData = (vehicle) => {
  const required = ["title", "price", "host", "category"]; // Added category as required
  const missing = required.filter((field) => !vehicle[field]);
  return missing.length === 0
    ? null
    : `Missing required fields: ${missing.join(", ")}`;
};

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7grn8zj.mongodb.net/?retryWrites=true&w=majority`;

// Creating a MongoClient with enhanced options
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Send Email To the User
const sendEmail = (emailAddress, emailData) => {
  const transporter = nodemailer.createTransporter({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.USER,
      pass: process.env.PASS,
    },
  });

  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Server is ready to take our emails", success);
    }
  });

  const mailBody = {
    from: process.env.USER,
    to: emailAddress,
    subject: emailData?.subject,
    html: `<p>${emailData?.message}</p>`,
  };

  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

async function run() {
  try {
    const usersCollection = client.db("vehiQuest").collection("users");
    const vehiclesCollection = client.db("vehiQuest").collection("vehicles");
    const bookingsCollection = client.db("vehiQuest").collection("bookings");

    // Role Verification MiddleWares
    // For Admin
    const verifyAdmin = async (req, res, next) => {
      try {
        const user = req.user;
        const query = { email: user?.email };
        const result = await usersCollection.findOne(query);
        if (!result || result?.role !== "admin")
          return res.status(401).send({ message: "unauthorized access" });
        next();
      } catch (error) {
        console.error("Admin verification error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    };

    // For Hosts
    const verifyHost = async (req, res, next) => {
      try {
        const user = req.user;
        const query = { email: user?.email };
        const result = await usersCollection.findOne(query);
        if (!result || result?.role !== "host")
          return res.status(401).send({ message: "unauthorized access" });
        next();
      } catch (error) {
        console.error("Host verification error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    };

    // Authentication related API
    app.put("/jwt", authLimiter, async (req, res) => {
      try {
        const user = req.body;
        if (!user.email || !isValidEmail(user.email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        console.log("I need a new jwt", user);
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "24h", // Reduced from 365d for security
        });
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (error) {
        console.error("JWT creation error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send({ message: "Logout failed", error: err.message });
      }
    });

    // Save or modify user email, status in DB
    app.put("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = req.body;

        if (!isValidEmail(email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        const query = { email: email };
        const options = { upsert: true };
        const isExist = await usersCollection.findOne(query);
        console.log("User found?----->", isExist);

        if (isExist) {
          if (user?.status === "Requested") {
            const result = await usersCollection.updateOne(
              query,
              {
                $set: user,
              },
              options
            );
            return res.send(result);
          } else {
            return res.send(isExist);
          }
        }

        const result = await usersCollection.updateOne(
          query,
          {
            $set: { ...user, timestamp: Date.now() },
          },
          options
        );
        res.send(result);
      } catch (error) {
        console.error("User update error:", error);
        res.status(500).send({ message: "Error updating user" });
      }
    });

    // Get user data for role checking
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!isValidEmail(email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        const result = await usersCollection.findOne({ email });
        if (!result) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("User fetch error:", error);
        res.status(500).send({ message: "Error fetching user" });
      }
    });

    // Get All Vehicles with optional category filtering
    app.get("/vehicles", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};

        // Add category filter if provided
        if (category && category !== "all") {
          query.category = category;
        }

        const result = await vehiclesCollection.find(query).toArray();
        res.send({
          message: "Vehicles fetched successfully",
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error("Error fetching vehicles:", error);
        res.status(500).send({ message: "Error fetching vehicles" });
      }
    });

    // Get vehicles for host
    app.get("/vehicles/host/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (!isValidEmail(email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        console.log("Fetching vehicles for host:", email);
        const result = await vehiclesCollection
          .find({ "host.email": email })
          .toArray();
        console.log("Found vehicles:", result.length);
        res.send({
          message: "Host vehicles fetched successfully",
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error("Error fetching host vehicles:", error);
        res.status(500).send({ message: "Error fetching vehicles" });
      }
    });

    // Get Single Vehicle
    app.get("/vehicle/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid vehicle ID format" });
        }

        const result = await vehiclesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching vehicle:", error);
        res.status(500).send({ message: "Error fetching vehicle" });
      }
    });

    // Save vehicle in the database
    app.post("/vehicles", verifyToken, async (req, res) => {
      try {
        const vehicle = req.body;

        const validationError = validateVehicleData(vehicle);
        if (validationError) {
          return res.status(400).send({ message: validationError });
        }

        const vehicleWithTimestamp = {
          ...vehicle,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await vehiclesCollection.insertOne(vehicleWithTimestamp);
        res.send({
          message: "Vehicle created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating vehicle:", error);
        res.status(500).send({ message: "Error creating vehicle" });
      }
    });

    // Delete a vehicle
    app.delete("/vehicles/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        console.log("Deleting vehicle with ID:", id);

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid vehicle ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const existingVehicle = await vehiclesCollection.findOne(query);

        if (!existingVehicle) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        // Check if the user owns this vehicle
        const userEmail = req.user?.email;
        if (existingVehicle.host?.email !== userEmail) {
          return res.status(403).send({
            message: "Unauthorized: You can only delete your own vehicles",
          });
        }

        const result = await vehiclesCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          console.log("Vehicle deleted successfully");
          res.send({
            message: "Vehicle deleted successfully",
            deletedCount: result.deletedCount,
          });
        } else {
          res.status(404).send({ message: "Vehicle not found" });
        }
      } catch (error) {
        console.error("Error deleting vehicle:", error);
        res
          .status(500)
          .send({ message: "Internal server error while deleting vehicle" });
      }
    });

    // Update a vehicle
    app.put("/vehicles/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const vehicleData = req.body;
        console.log("Updating vehicle with ID:", id);

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid vehicle ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const existingVehicle = await vehiclesCollection.findOne(filter);

        if (!existingVehicle) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        // Check if the user owns this vehicle
        const userEmail = req.user?.email;
        if (existingVehicle.host?.email !== userEmail) {
          return res.status(403).send({
            message: "Unauthorized: You can only update your own vehicles",
          });
        }

        const updateDoc = {
          $set: {
            ...vehicleData,
            updatedAt: new Date(),
            host: existingVehicle.host, // Preserve host information
          },
        };

        const result = await vehiclesCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        if (result.modifiedCount === 1) {
          console.log("Vehicle updated successfully");
          const updatedVehicle = await vehiclesCollection.findOne(filter);
          res.send({
            message: "Vehicle updated successfully",
            vehicle: updatedVehicle,
            modifiedCount: result.modifiedCount,
          });
        } else {
          res.send({ message: "No changes made to the vehicle" });
        }
      } catch (error) {
        console.error("Error updating vehicle:", error);
        res
          .status(500)
          .send({ message: "Internal server error while updating vehicle" });
      }
    });

    // Payment Intent - Generating Payment Secret for stripe
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      try {
        const { price } = req.body;

        if (!price || price <= 0) {
          return res.status(400).send({ message: "Invalid price amount" });
        }

        const amount = parseInt(price * 100);
        if (amount < 50) {
          // Stripe minimum is $0.50
          return res
            .status(400)
            .send({ message: "Amount must be at least $0.50" });
        }

        const { client_secret } = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: client_secret });
      } catch (error) {
        console.error("Payment intent creation error:", error);
        res.status(500).send({ message: "Error creating payment intent" });
      }
    });

    // Save Booking Info in Booking Collection
    app.post("/bookings", verifyToken, async (req, res) => {
      try {
        const booking = req.body;

        // Validate required booking fields
        if (!booking.guest?.email || !booking.host || !booking.transactionId) {
          return res
            .status(400)
            .send({ message: "Missing required booking information" });
        }

        const bookingWithTimestamp = {
          ...booking,
          createdAt: new Date(),
          status: "confirmed",
        };

        const result = await bookingsCollection.insertOne(bookingWithTimestamp);

        if (result.insertedId) {
          // Send Email to guest
          sendEmail(booking.guest.email, {
            subject: "Booking Successful!",
            message: `Vehicle Ready, get your vehicle from store, Your Transaction Id: ${booking.transactionId}`,
          });

          // Send Email to Host
          sendEmail(booking.host, {
            subject: "Your Vehicle got booked!",
            message: `Deliver you vehicle to the store. ${booking.guest.name} is on the way.....`,
          });
        }

        res.send({
          message: "Booking created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Booking creation error:", error);
        res.status(500).send({ message: "Error creating booking" });
      }
    });

    // Update Vehicle Booking Status
    app.patch("/vehicles/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const status = req.body.status;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid vehicle ID format" });
        }

        if (typeof status !== "boolean") {
          return res
            .status(400)
            .send({ message: "Status must be a boolean value" });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            booked: status,
            updatedAt: new Date(),
          },
        };

        const result = await vehiclesCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        res.send({
          message: "Vehicle status updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Vehicle status update error:", error);
        res.status(500).send({ message: "Error updating vehicle status" });
      }
    });

    // Get all bookings for guest
    app.get("/bookings", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.send([]);

        if (!isValidEmail(email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        const query = { "guest.email": email };
        const result = await bookingsCollection.find(query).toArray();
        res.send({
          message: "Guest bookings fetched successfully",
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error("Error fetching guest bookings:", error);
        res.status(500).send({ message: "Error fetching bookings" });
      }
    });

    // Get all bookings for host
    app.get("/bookings/host", verifyToken, verifyHost, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.send([]);

        if (!isValidEmail(email)) {
          return res.status(400).send({ message: "Invalid email format" });
        }

        const query = { host: email };
        const result = await bookingsCollection.find(query).toArray();
        res.send({
          message: "Host bookings fetched successfully",
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error("Error fetching host bookings:", error);
        res.status(500).send({ message: "Error fetching host bookings" });
      }
    });

    // Delete a booking
    app.delete("/bookings/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid booking ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await bookingsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Booking not found" });
        }

        res.send({
          message: "Booking deleted successfully",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Booking deletion error:", error);
        res.status(500).send({ message: "Error deleting booking" });
      }
    });

    // Admin Statistics
    app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const bookingsDetails = await bookingsCollection
          .find({}, { projection: { date: 1, price: 1 } })
          .toArray();
        const userCount = await usersCollection.countDocuments();
        const vehicleCount = await vehiclesCollection.countDocuments();
        const totalSale = bookingsDetails.reduce(
          (sum, data) => sum + (data.price || 0),
          0
        );

        const chartData = bookingsDetails.map((data) => {
          const day = new Date(data.date).getDate();
          const month = new Date(data.date).getMonth() + 1;
          return [day + "/" + month, data.price || 0];
        });
        chartData.unshift(["Day", "Sale"]);

        res.send({
          totalSale,
          bookingCount: bookingsDetails.length,
          userCount,
          vehicleCount,
          chartData,
        });
      } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).send({ message: "Error fetching admin statistics" });
      }
    });

    // Host Statistics
    app.get("/host-stat", verifyToken, verifyHost, async (req, res) => {
      try {
        const { email } = req.user;

        const bookingsDetails = await bookingsCollection
          .find(
            { host: email },
            {
              projection: {
                date: 1,
                price: 1,
              },
            }
          )
          .toArray();
        const vehicleCount = await vehiclesCollection.countDocuments({
          "host.email": email,
        });
        const totalSale = bookingsDetails.reduce(
          (acc, data) => acc + (data.price || 0),
          0
        );
        const chartData = bookingsDetails.map((data) => {
          const day = new Date(data.date).getDate();
          const month = new Date(data.date).getMonth() + 1;
          return [day + "/" + month, data.price || 0];
        });
        chartData.splice(0, 0, ["Day", "Sale"]);

        const userDoc = await usersCollection.findOne(
          { email },
          {
            projection: {
              timestamp: 1,
            },
          }
        );

        res.send({
          totalSale,
          bookingCount: bookingsDetails.length,
          vehicleCount,
          chartData,
          hostSince: userDoc?.timestamp,
        });
      } catch (error) {
        console.error("Host stats error:", error);
        res.status(500).send({ message: "Error fetching host statistics" });
      }
    });

    // Guest Statistics
    app.get("/guest-stat", verifyToken, async (req, res) => {
      try {
        const { email } = req.user;

        const bookingsDetails = await bookingsCollection
          .find(
            { "guest.email": email },
            {
              projection: {
                date: 1,
                price: 1,
              },
            }
          )
          .toArray();

        const chartData = bookingsDetails.map((data) => {
          const day = new Date(data.date).getDate();
          const month = new Date(data.date).getMonth() + 1;
          return [day + "/" + month, data.price || 0];
        });
        chartData.splice(0, 0, ["Day", "Reservation"]);

        const userDoc = await usersCollection.findOne(
          { email },
          {
            projection: {
              timestamp: 1,
            },
          }
        );

        const totalSpent = bookingsDetails.reduce(
          (acc, data) => acc + (data.price || 0),
          0
        );

        res.send({
          bookingCount: bookingsDetails.length,
          chartData,
          guestSince: userDoc?.timestamp,
          totalSpent,
        });
      } catch (error) {
        console.error("Guest stats error:", error);
        res.status(500).send({ message: "Error fetching guest statistics" });
      }
    });

    // Get All Users for admin
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send({
          message: "Users fetched successfully",
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error("Users fetch error:", error);
        res.status(500).send({ message: "Error fetching users" });
      }
    });

    // Update user Role for admin
    app.put(
      "/users/update/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const user = req.body;

          if (!isValidEmail(email)) {
            return res.status(400).send({ message: "Invalid email format" });
          }

          const query = { email: email };
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              ...user,
              timestamp: Date.now(),
            },
          };

          const result = await usersCollection.updateOne(
            query,
            updateDoc,
            options
          );
          res.send({
            message: "User updated successfully",
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount,
          });
        } catch (error) {
          console.error("User update error:", error);
          res.status(500).send({ message: "Error updating user" });
        }
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Connection will be maintained for the application lifecycle
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from VehiQuest Server..");
});

app.listen(port, () => {
  console.log(`VehiQuest is Driving on port ${port}`);
});
