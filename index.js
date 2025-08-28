const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require("nodemailer");

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
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

// Creating a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Send Email To the User
const sendEmail = (emailAddress, emailData) => {
  //Create a transporter
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

  //verify connection
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

    // *** Role Verification MiddleWares ***
    // For Admin
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access" });
      next();
    };

    // For Hosts
    const verifyHost = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "host")
        return res.status(401).send({ message: "unauthorized access" });
      next();
    };

    // auth related api
    app.put("/jwt", async (req, res) => {
      const user = req.body;
      console.log("I need a new jwt", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
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
        res.status(500).send(err);
      }
    });

    // Save or modify user email, status in DB
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
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
    });

    // FIXED: Get user data (for role checking) - Updated to use /users/ endpoint
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      if (!result) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(result);
    });

    // Get All Vehicle
    app.get("/vehicles", async (req, res) => {
      const result = await vehiclesCollection.find().toArray();
      res.send(result);
    });

    //Save Vehicle for the ***host***
    app.get("/rooms/:email", verifyToken, verifyHost, async (req, res) => {
      const email = req.params.email;
      const result = await vehiclesCollection
        .find({ "host.email": email })
        .toArray();
      res.send(result);
    });

    // Get Single Vehicle
    app.get("/vehicle/:id", async (req, res) => {
      const id = req.params.id;
      const result = await vehiclesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Save vehicle in the database
    app.post("/vehicles", verifyToken, async (req, res) => {
      const vehicle = req.body;
      const result = await vehiclesCollection.insertOne(vehicle);
      res.send(result);
    });

    // Update A Vehicle
    app.put("/vehicles/:id", verifyToken, async (req, res) => {
      const vehicle = req.body;
      console.log(vehicle);

      const filter = { _id: new ObjectId(req.params.id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: vehicle,
      };
      const result = await vehiclesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // delete a vehicle
    app.delete("/vehicles/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await vehiclesCollection.deleteOne(query);
      res.send(result);
    });

    // ****Payment Intent****
    // Generating Payment Secret for stripe
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      if (!price || amount < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: client_secret });
    });

    // Save Booking Info in Booking Collection
    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      // Send Email.....
      if (result.insertedId) {
        // To guest
        sendEmail(booking.guest.email, {
          subject: "Booking Successful!",
          message: `Vehicle Ready, get your vehicle from store, Your Transaction Id: ${booking.transactionId}`,
        });

        // To Host
        sendEmail(booking.host, {
          subject: "Your Vehicle got booked!",
          message: `Deliver you vehicle to the store. ${booking.guest.name} is on the way.....`,
        });
      }
      res.send(result);
    });

    // Update Vehicle Booking Status
    app.patch("/vehicles/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          booked: status,
        },
      };
      const result = await vehiclesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Getting All the bookings guest have booked
    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const query = { "guest.email": email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // Getting All the bookings Host have booked
    app.get("/bookings/host", verifyToken, verifyHost, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const query = { host: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // delete a booking
    app.delete("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // Admin Stat Data
    app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
      const bookingsDetails = await bookingsCollection
        .find({}, { projection: { date: 1, price: 1 } })
        .toArray();
      const userCount = await usersCollection.countDocuments();
      const vehicleCount = await vehiclesCollection.countDocuments();
      const totalSale = bookingsDetails.reduce(
        (sum, data) => sum + data.price,
        0
      );

      const chartData = bookingsDetails.map((data) => {
        const day = new Date(data.date).getDate();
        const month = new Date(data.date).getMonth() + 1;
        return [day + "/" + month, data.price];
      });
      chartData.unshift(["Day", "Sale"]);
      res.send({
        totalSale,
        bookingCount: bookingsDetails.length,
        userCount,
        vehicleCount,
        chartData,
      });
    });

    // Host Statistics
    app.get("/host-stat", verifyToken, verifyHost, async (req, res) => {
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
        (acc, data) => acc + data.price,
        0
      );
      const chartData = bookingsDetails.map((data) => {
        const day = new Date(data.date).getDate();
        const month = new Date(data.date).getMonth() + 1;
        return [day + "/" + month, data.price];
      });
      chartData.splice(0, 0, ["Day", "Sale"]);
      const { timestamp } = await usersCollection.findOne(
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
        hostSince: timestamp,
      });
    });

    // Guest Statistics
    app.get("/guest-stat", verifyToken, async (req, res) => {
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
        return [day + "/" + month, data.price];
      });
      chartData.splice(0, 0, ["Day", "Reservation"]);
      const { timestamp } = await usersCollection.findOne(
        { email },
        {
          projection: {
            timestamp: 1,
          },
        }
      );
      const totalSpent = bookingsDetails.reduce(
        (acc, data) => acc + data.price,
        0
      );
      res.send({
        bookingCount: bookingsDetails.length,
        chartData,
        guestSince: timestamp,
        totalSpent,
      });
    });

    // Get All Users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // FIXED: Update user Role - Now active and working
    app.put(
      "/users/update/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const user = req.body;
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
        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from VehiQuest Server..");
});

app.listen(port, () => {
  console.log(`VehiQuest is Driving on port ${port}`);
});

// const express = require("express");
// const app = express();
// require("dotenv").config();
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const jwt = require("jsonwebtoken");
// const morgan = require("morgan");
// const port = process.env.PORT || 5000;
// const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
// const nodemailer = require("nodemailer");

// // middleware
// const corsOptions = {
//   origin: ["http://localhost:5173", "http://localhost:5174"],
//   credentials: true,
//   optionSuccessStatus: 200,
// };
// app.use(cors(corsOptions));
// app.use(express.json());
// app.use(cookieParser());
// app.use(morgan("dev"));
// const verifyToken = async (req, res, next) => {
//   const token = req.cookies?.token;
//   console.log(token);
//   if (!token) {
//     return res.status(401).send({ message: "unauthorized access" });
//   }
//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     if (err) {
//       console.log(err);
//       return res.status(401).send({ message: "unauthorized access" });
//     }
//     req.user = decoded;
//     next();
//   });
// };
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7grn8zj.mongodb.net/?retryWrites=true&w=majority`;

// // Create a MongoClient with a MongoClientOptions object to set the Stable API version
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// // Send Email To the User

// const sendEmail = (emailAddress, emailData) => {
//   //Create a transporter
//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     host: "smtp.gmail.com",
//     port: 587,
//     secure: false,
//     auth: {
//       user: process.env.USER,
//       pass: process.env.PASS,
//     },
//   });

//   //verify connection
//   transporter.verify((error, success) => {
//     if (error) {
//       console.log(error);
//     } else {
//       console.log("Server is ready to take our emails", success);
//     }
//   });

//   const mailBody = {
//     from: process.env.USER,
//     to: emailAddress,
//     subject: emailData?.subject,
//     html: `<p>${emailData?.message}</p>`,
//   };

//   transporter.sendMail(mailBody, (error, info) => {
//     if (error) {
//       console.log(error);
//     } else {
//       console.log("Email sent: " + info.response);
//     }
//   });
// };
// async function run() {
//   try {
//     const usersCollection = client.db("vehiQuest").collection("users");
//     const vehiclesCollection = client.db("vehiQuest").collection("vehicles");
//     const bookingsCollection = client.db("vehiQuest").collection("bookings");

//     // *** Role Verification MiddleWares ***
//     // For Admin
//     const verifyAdmin = async (req, res, next) => {
//       const user = req.user;
//       const query = { email: user?.email };
//       const result = await usersCollection.findOne(query);
//       if (!result || result?.role !== "admin")
//         return res.status(401).send({ message: "unauthorized access" });
//       next();
//     };
//     // For Hosts
//     const verifyHost = async (req, res, next) => {
//       const user = req.user;
//       const query = { email: user?.email };
//       const result = await usersCollection.findOne(query);
//       if (!result || result?.role !== "host")
//         return res.status(401).send({ message: "unauthorized access" });
//       next();
//     };

//     // auth related api
//     // Change this line in your backend (around line 95)
//     app.put("/jwt", async (req, res) => {
//       // Changed from POST to PUT
//       const user = req.body;
//       console.log("I need a new jwt", user);
//       const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
//         expiresIn: "365d",
//       });
//       res
//         .cookie("token", token, {
//           httpOnly: true,
//           secure: process.env.NODE_ENV === "production",
//           sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
//         })
//         .send({ success: true });
//     });
//     // app.post("/jwt", async (req, res) => {
//     //   const user = req.body;
//     //   console.log("I need a new jwt", user);
//     //   const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
//     //     expiresIn: "365d",
//     //   });
//     //   res
//     //     .cookie("token", token, {
//     //       httpOnly: true,
//     //       secure: process.env.NODE_ENV === "production",
//     //       sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
//     //     })
//     //     .send({ success: true });
//     // });

//     // Logout
//     app.get("/logout", async (req, res) => {
//       try {
//         res
//           .clearCookie("token", {
//             maxAge: 0,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
//           })
//           .send({ success: true });
//         console.log("Logout successful");
//       } catch (err) {
//         res.status(500).send(err);
//       }
//     });

//     // Save or modify user email, status in DB
//     app.put("/users/:email", async (req, res) => {
//       const email = req.params.email;
//       const user = req.body;
//       const query = { email: email };
//       const options = { upsert: true };
//       const isExist = await usersCollection.findOne(query);
//       console.log("User found?----->", isExist);
//       if (isExist) {
//         if (user?.status === "Requested") {
//           const result = await usersCollection.updateOne(
//             query,
//             {
//               $set: user,
//             },
//             options
//           );
//           return res.send(result);
//         } else {
//           return res.send(isExist);
//         }
//       }
//       const result = await usersCollection.updateOne(
//         query,
//         {
//           $set: { ...user, timestamp: Date.now() },
//         },
//         options
//       );
//       res.send(result);
//     });

//     // ****************New Data here *************

//     // Get All Vehicle
//     app.get("/vehicles", async (req, res) => {
//       const result = await vehiclesCollection.find().toArray();
//       res.send(result);
//     });
//     //Save Vehicle for the ***host***
//     app.get("/rooms/:email", verifyToken, verifyHost, async (req, res) => {
//       const email = req.params.email;
//       const result = await vehiclesCollection
//         .find({ "host.email": email })
//         .toArray();
//       res.send(result);
//     });
//     // Get Single Vehicle
//     app.get("/vehicle/:id", async (req, res) => {
//       const id = req.params.id;
//       const result = await vehiclesCollection.findOne({
//         _id: new ObjectId(id),
//       });
//       res.send(result);
//     });

//     // Save vehicle in the database
//     app.post("/vehicles", verifyToken, async (req, res) => {
//       const vehicle = req.body;
//       const result = await vehiclesCollection.insertOne(vehicle);
//       res.send(result);
//     });

//     // Update A Vehicle
//     app.put("/vehicles/:id", verifyToken, async (req, res) => {
//       const vehicle = req.body;
//       console.log(vehicle);

//       const filter = { _id: new ObjectId(req.params.id) };
//       const options = { upsert: true };
//       const updateDoc = {
//         $set: vehicle,
//       };
//       const result = await vehiclesCollection.updateOne(
//         filter,
//         updateDoc,
//         options
//       );
//       res.send(result);
//     });
//     // delete a vehicle
//     app.delete("/vehicles/:id", verifyToken, async (req, res) => {
//       const id = req.params.id;
//       const query = { _id: new ObjectId(id) };
//       const result = await vehiclesCollection.deleteOne(query);
//       res.send(result);
//     });

//     // ****Payment Intent****
//     // Generating Payment Secret for stripe
//     app.post("/create-payment-intent", verifyToken, async (req, res) => {
//       const { price } = req.body;
//       const amount = parseInt(price * 100);
//       if (!price || amount < 1) return;
//       const { client_secret } = await stripe.paymentIntents.create({
//         amount: amount,
//         currency: "usd",
//         payment_method_types: ["card"],
//       });
//       res.send({ clientSecret: client_secret });
//     });

//     // **Updating Here
//     // Save Booking Info in Booking Collection

//     app.post("/bookings", verifyToken, async (req, res) => {
//       const booking = req.body;
//       const result = await bookingsCollection.insertOne(booking);
//       // Send Email.....
//       if (result.insertedId) {
//         // To guest
//         sendEmail(booking.guest.email, {
//           subject: "Booking Successful!",
//           message: `Vehicle Ready, get your vehicle from strore, Your Transaction Id: ${booking.transactionId}`,
//         });

//         // To Host
//         sendEmail(booking.host, {
//           subject: "Your Vehicle got booked!",
//           message: `Deliver you vehicle to the store. ${booking.guest.name} is on the way.....`,
//         });
//       }
//       res.send(result);
//     });

//     // Update Vehicle Booking Status
//     app.patch("/vehicles/status/:id", async (req, res) => {
//       const id = req.params.id;
//       const status = req.body.status;
//       const query = { _id: new ObjectId(id) };
//       const updateDoc = {
//         $set: {
//           booked: status,
//         },
//       };
//       const result = await vehiclesCollection.updateOne(query, updateDoc);
//       res.send(result);
//     });

//     // Getting All the bookings guest have booked
//     app.get("/bookings", verifyToken, async (req, res) => {
//       const email = req.query.email;
//       if (!email) return res.send([]);
//       const query = { "guest.email": email };
//       const result = await bookingsCollection.find(query).toArray();
//       res.send(result);
//     });

//     // Getting All the bookings Host have booked
//     app.get("/bookings/host", verifyToken, verifyHost, async (req, res) => {
//       const email = req.query.email;
//       if (!email) return res.send([]);
//       const query = { host: email };
//       const result = await bookingsCollection.find(query).toArray();
//       res.send(result);
//     });
//     // delete a booking
//     app.delete("/bookings/:id", verifyToken, async (req, res) => {
//       const id = req.params.id;
//       const query = { _id: new ObjectId(id) };
//       const result = await bookingsCollection.deleteOne(query);
//       res.send(result);
//     });

//     // Admin Stat Data
//     app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
//       const bookingsDetails = await bookingsCollection
//         .find({}, { projection: { date: 1, price: 1 } })
//         .toArray();
//       const userCount = await usersCollection.countDocuments();
//       const vehicleCount = await vehiclesCollection.countDocuments();
//       const totalSale = bookingsDetails.reduce(
//         (sum, data) => sum + data.price,
//         0
//       );

//       const chartData = bookingsDetails.map((data) => {
//         const day = new Date(data.date).getDate();
//         const month = new Date(data.date).getMonth() + 1;
//         return [day + "/" + month, data.price];
//       });
//       chartData.unshift(["Day", "Sale"]);
//       res.send({
//         totalSale,
//         bookingCount: bookingsDetails.length,
//         userCount,
//         vehicleCount,
//         chartData,
//       });
//     });
//     // Host Statistics
//     app.get("/host-stat", verifyToken, verifyHost, async (req, res) => {
//       const { email } = req.user;

//       const bookingsDetails = await bookingsCollection
//         .find(
//           { host: email },
//           {
//             projection: {
//               date: 1,
//               price: 1,
//             },
//           }
//         )
//         .toArray();
//       const vehicleCount = await vehiclesCollection.countDocuments({
//         "host.email": email,
//       });
//       const totalSale = bookingsDetails.reduce(
//         (acc, data) => acc + data.price,
//         0
//       );
//       const chartData = bookingsDetails.map((data) => {
//         const day = new Date(data.date).getDate();
//         const month = new Date(data.date).getMonth() + 1;
//         return [day + "/" + month, data.price];
//       });
//       chartData.splice(0, 0, ["Day", "Sale"]);
//       const { timestamp } = await usersCollection.findOne(
//         { email },
//         {
//           projection: {
//             timestamp: 1,
//           },
//         }
//       );
//       res.send({
//         totalSale,
//         bookingCount: bookingsDetails.length,
//         vehicleCount,
//         chartData,
//         hostSince: timestamp,
//       });
//     });
//     // Guest Statistics
//     app.get("/guest-stat", verifyToken, async (req, res) => {
//       const { email } = req.user;

//       const bookingsDetails = await bookingsCollection
//         .find(
//           { "guest.email": email },
//           {
//             projection: {
//               date: 1,
//               price: 1,
//             },
//           }
//         )
//         .toArray();

//       const chartData = bookingsDetails.map((data) => {
//         const day = new Date(data.date).getDate();
//         const month = new Date(data.date).getMonth() + 1;
//         return [day + "/" + month, data.price];
//       });
//       chartData.splice(0, 0, ["Day", "Reservation"]);
//       const { timestamp } = await usersCollection.findOne(
//         { email },
//         {
//           projection: {
//             timestamp: 1,
//           },
//         }
//       );
//       const totalSpent = bookingsDetails.reduce(
//         (acc, data) => acc + data.price,
//         0
//       );
//       res.send({
//         bookingCount: bookingsDetails.length,
//         chartData,
//         guestSince: timestamp,
//         totalSpent,
//       });
//     });

//     // Get All Users
//     app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
//       const result = await usersCollection.find().toArray();
//       res.send(result);
//     });
//     // // ****User Role *********
//     // // Get user Role
//     // app.get("/user/:email", async (req, res) => {
//     //   const email = req.params.email;
//     //   const result = await usersCollection.findOne({ email });
//     //   res.send(result);
//     // });

//     // // Update user Role
//     // app.put("/users/update/:email", verifyToken, async (req, res) => {
//     //   const email = req.params.email;
//     //   const user = req.body;
//     //   const query = { email: email };
//     //   const options = { upsert: true };
//     //   const updateDoc = {
//     //     $set: {
//     //       ...user,
//     //       timestamp: Date.now(),
//     //     },
//     //   };
//     //   const result = await usersCollection.updateOne(query, updateDoc, options);
//     //   res.send(result);
//     // });

//     // // Get all vehicles
//     // app.get("/vehicles", async (req, res) => {
//     //   const result = await vehiclesCollection.find().toArray();
//     //   res.send(result);
//     // });
//     // //get vehicles for host
//     // app.get("/vehicles/:email", verifyToken, verifyHost, async (req, res) => {
//     //   const email = req.params.email;
//     //   const result = await vehiclesCollection
//     //     .find({ "host.email": email })
//     //     .toArray();
//     //   res.send(result);
//     // });

//     // Send a ping to confirm a successful connection
//     await client.db("admin").command({ ping: 1 });
//     console.log(
//       "Pinged your deployment. You successfully connected to MongoDB!"
//     );
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }
// run().catch(console.dir);

// app.get("/", (req, res) => {
//   res.send("Hello from VehiQuest Server..");
// });

// app.listen(port, () => {
//   console.log(`VehiQuest is Driving on port ${port}`);
// });
