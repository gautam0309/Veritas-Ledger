
const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../services/logger');


const opts = {
    points: 20, // Each request consumes 1 point.
    duration: 1,
};


const rateLimiter = new RateLimiterMemory(opts);

const rateLimiterMiddlewareInMemory = (req, res, next) => {
    rateLimiter.consume(req.ip)
        .then(() => {
            next();
        })
        .catch((err) => {
            logger.error("ERROR: Too many request coming in from IP: " + req.ip);
            logger.error(err);
            return res.status(429).send('Too Many Requests');
        });
};


const strictOpts = {
    points: 10,
    duration: 60 * 15, // 15 minutes
    blockDuration: 60 * 15,
};

const strictRateLimiter = new RateLimiterMemory(strictOpts);

const strictRateLimiterMiddleware = (req, res, next) => {
    strictRateLimiter.consume(req.ip)
        .then(() => {
            next();
        })
        .catch((err) => {
            logger.error("Too many login attempts from IP: " + req.ip);
            return res.status(429).send('Too Many Login Attempts. Please try again after 15 minutes.');
        });
};


module.exports = { rateLimiterMiddlewareInMemory, strictRateLimiterMiddleware };
