const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gocqb.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors-portal")
      .collection("services");
    const bookingCollection = client.db("doctors-portal").collection("booking");
    const userCollection = client.db("doctors-portal").collection("user");

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/user", verifyJwt, async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const updateDoc = {
          $set: { role: "admin" },
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send({ result, token });
    });

    //WARNING:
    //This is not the proper way to query
    //After learning mongoDB more use aggregate lookup,pipeline,match,group,
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      //Step 1: Get all services
      const services = await servicesCollection.find().toArray();

      //step 2:Get the booking of the day [{},{},{},{},{},{},{}]
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //Step 3: For each services find booking for that service
      services.forEach((service) => {
        //Step 4 :find booking for that service[{},{},{},{}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );

        //Step 5:Select slots for the service booking ['','','','',]
        const bookedSlots = serviceBookings.map((book) => book.slot);

        //Step 6:Select those slots that are not available in booked
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );

        // Step 7: Set available to slots to make it easier
        service.slots = available;
      });

      res.send(services);
    });

    /**
     * API Naming Convention
     * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
     * app.get('/booking/:id') // get a specific booking
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id) //
     * app.delete('/booking/:id) //
     */

    app.get("/booking", verifyJwt, async (req, res) => {
      const patient = req.query.patient;
      const token = req.headers.authorization;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
  } finally {
  }
}

run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello From doctors portal!");
});

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`);
});
