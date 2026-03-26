var express = require('express');
var router = express.Router();
const apiController = require("../controllers/api-controller");
const studentMiddleware = require('../middleware/student-middleware');

/* GET users listing. */
router.get('/generateProof', studentMiddleware.authenticateLogin, apiController.getGenerateProof);
router.post('/verify', apiController.postVerifyCert);



// error handler
router.use(apiController.apiErrorHandler);
module.exports = router;
