const express = require('express');
const router = express.Router();

let title = "Blockchain Certificate";
let root = "index";


router.get('/', function(req, res, next) { res.render('index', {   title, root,
    logInType: req.session.user_type || "none"
});});




module.exports = router;
