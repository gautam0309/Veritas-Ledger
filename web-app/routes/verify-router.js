const express = require('express');
const router = express.Router();
const verifyController = require('../controllers/verify-controller');
const universityController = require('../controllers/university-controller');
const limiter = require('../middleware/rate-limiter-middleware');

let title = "Verification Portal";
let root = "verify";

router.get('/', function (req, res, next) {
    res.render('verify', {
        title, root,
        logInType: req.session.user_type || "none"
    });
});

router.post('/', limiter.rateLimiterMiddlewareInMemory, verifyController.postVerify);
router.post('/rollnumber', limiter.rateLimiterMiddlewareInMemory, verifyController.postVerifyByRollNumber);

router.get('/bulk', verifyController.getBulkVerifyPage);
router.post('/bulk', limiter.rateLimiterMiddlewareInMemory, universityController.csvUpload.single('csvFile'), verifyController.postBulkVerify);

module.exports = router;
