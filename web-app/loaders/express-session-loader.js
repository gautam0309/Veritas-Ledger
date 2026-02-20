
const expressSession = require('express-session');
const connectMongo = require('connect-mongo');
const config = require("./config");
const mongoose = require("../database/mongoose");

const mongoStore = connectMongo(expressSession);

let expessSessionConfig = {
    name: 'session_id', //This will need to be sent with all ajax cals to verify session/authenticate user.
    secret: config.expressSessionSecret,
    resave: false,
    httpOnly: true,
    saveUninitialized: false,
    cookie: {
        maxAge: 86400000,
        httpOnly: true, // Prevents client-side scripts from reading the cookie
        sameSite: 'lax', // Helps mitigate basic CSRF attacks
        secure: process.env.NODE_ENV === 'production' // Only send cookie over HTTPS in production
    },
    store: new mongoStore({
        mongooseConnection: mongoose.connection,
        collection: "session"
    })
};

let sessionMiddleware = expressSession(expessSessionConfig);


module.exports = sessionMiddleware;
//must come after mongoDB is loaded.