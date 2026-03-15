
//initialize env variables, database and loaders.
const config = require('./loaders/config');

//load database
const mongoose = require('./database/mongoose');

//load fabric environemtn
require('./loaders/fabric-loader');


//third party libraries
let createError = require('http-errors');
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

//local imports
let limiter = require('./middleware/rate-limiter-middleware');
const logger = require('./services/logger');
const sessionMiddleware = require('./loaders/express-session-loader');
const securityMiddleware = require('./middleware/security-middleware');
const alertService = require('./services/alert-service');

// Start Security Alert Service (SAMM Operations L3)
alertService.start();

//Router imports
let indexRouter = require('./routes/index-router');
let apiRouter = require('./routes/api-router');
let universityRouter = require('./routes/university-router');
let studentRouter = require('./routes/student-router');
let verifyRouter = require('./routes/verify-router');

//express
let app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//middleware

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));
app.use(limiter.rateLimiterMiddlewareInMemory);
app.use(morgan('tiny', { stream: logger.stream }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionMiddleware);
app.use(securityMiddleware.bindSessionToClient);
app.use(securityMiddleware.generateCsrfToken);
app.use(securityMiddleware.generateNonce);

app.use(helmet());

app.use((req, res, next) => {
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", `'nonce-${res.locals.nonce}'`, "https://code.jquery.com", "https://cdnjs.cloudflare.com", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net", "https://ajax.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://code.jquery.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  })(req, res, next);
});

//routers
app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/university', universityRouter);
app.use('/student', studentRouter);
app.use('/verify', verifyRouter);
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


module.exports = app;
