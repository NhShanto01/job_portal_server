const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    // console.log('Token inside the verifyToken:', token);

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err){
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.user = decoded
        next();    
    }) 


}

// Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ocgei.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // job Collections and apis
        const userCollection = client.db('jobPortal').collection('users');

        // user related apis
        app.post('/users', async (req, res) => {
            const user = req.body;
            //insert email if user doesn't exist => simple checking
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ success: true, insertedId: null });
            }

            const result = await userCollection.insertOne(user);
            res.send({ success: true, insertedId: result.insertedId });
        });

        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send({ success: true, deletedId: id });
        });

        
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            if (user) {
                res.send({ success: true, user: user });
            } else {
                res.status(404).send({ message: 'User not found' });
            }
        });

        // job Collections and apis
        const jobCollection = client.db('jobPortal').collection('jobs');
        
        //jwt token related apis
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5m' });
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: false
            })
                .send({ success: true, token: token });

        });
        app.post ('/logout', (req, res) => {
            res
                .clearCookie('token',{
                    httpOnly: true,
                    secure: false
                })
                .send({ success: true, message: 'Logged out successfully' });
        });

        app.get('/jobs', async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email };
            }

            const cursor = jobCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobCollection.insertOne(newJob);
            res.send({ success: true, insertedId: result.insertedId });
        });

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await jobCollection.findOne(query);
            res.send(result);
        });

        // search jobs by industry, location, and keyword
        //     app.get('/jobs', async (req, res) => {
        //     const { industry, location, keyword } = req.query;
        //     const query = {};

        //     if (industry) query.industry = { $regex: industry, $options: 'i' };
        //     if (location) query.location = { $regex: location, $options: 'i' };
        //     if (keyword) {
        //         query.$or = [
        //             { title: { $regex: keyword, $options: 'i' } },
        //             { description: { $regex: keyword, $options: 'i' } }
        //         ];
        //     }

        //     const result = await jobCollection.find(query).toArray();
        //     res.send(result);
        // });


        // job_Application Collections and apis


        const jobApplicationCollection = client.db('jobPortal').collection('job-applications');

        app.post('/job-applications', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);

            //poor way to aggregate data
            const id = application.jobId;
            const query = { _id: new ObjectId(id) };
            const job = await jobCollection.findOne(query);
            // console.log(job);
            let newCount = 0;
            if (job.applicantsCount) {
                newCount = job.applicantsCount + 1;
            } else {
                newCount = 1;
            }
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: { applicantsCount: newCount } };
            const updateResult = await jobCollection.updateOne(filter, updateDoc);


            res.send({ success: true, insertedId: result.insertedId });
        });

        app.get('/job-application', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { applicantEmail: email };

            console.log(req.cookies?.token);
            if(req.user.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden access' });

            }

            const result = await jobApplicationCollection.find(query).toArray();

            //poorest way to aggregate data
            for (const application of result) {
                const query1 = { _id: new ObjectId(application.jobId) };
                const job = await jobCollection.findOne(query1);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                    application.applicationDeadline = job.applicationDeadline;
                    application.jobType = job.jobType;
                    application.description = job.description;
                    application.requirements = job.requirements;
                    application.salaryRange = job.salaryRange;
                    application.hr_name = job.hr_name;
                    application.hr_email = job.hr_email;
                }

            }
            res.send(result);
        });

        app.get('/job-application/jobs/:jobId', async (req, res) => {
            const jobId = req.params.jobId;
            const query = { jobId: jobId };
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        })

        app.delete('/job-application/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await jobApplicationCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount > 0) {
                    res.send({ success: true, message: 'Application deleted' });
                } else {
                    res.send({ success: false, message: 'No application found to delete' });
                }
            } catch (error) {
                console.error('Error deleting application:', error);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });
        
        app.patch('/job-application/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: data.status
                }
            };
            const result = await jobApplicationCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // blog Collections and apis
        const blogCollection = client.db('jobPortal').collection('blogs');

        app.get('/blogs', async (req, res) => {
            const cursor = blogCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Job is falling behind');
});



app.listen(port, () => {
    console.log(`Server is running on ${port}`);
});    