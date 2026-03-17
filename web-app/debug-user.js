const mongoose = require('mongoose');
const students = require('./database/models/students');
const universities = require('./database/models/universities');
require('dotenv').config({ path: './.env' });

async function debugUser(email) {
    try {
        await mongoose.connect(process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27014/VeritasLedger');

        console.log(`Searching for email: ${email}`);

        const student = await students.findOne({ email }).select('+password');
        if (student) {
            console.log('Found in STUDENTS collection');
            console.log('Name:', student.name);
            console.log('Has password hash:', !!student.password);
            // Don't log the hash for privacy, but we can verify it against '1234'
            const bcrypt = require('bcryptjs');
            const match = await bcrypt.compare('1234', student.password);
            console.log('Password matches "1234":', match);
        } else {
            console.log('Not found in STUDENTS collection');
        }

        const university = await universities.findOne({ email }).select('+password');
        if (university) {
            console.log('Found in UNIVERSITIES collection');
            console.log('Name:', university.name);
            console.log('Has password hash:', !!university.password);
            const bcrypt = require('bcryptjs');
            const match = await bcrypt.compare('1234', university.password);
            console.log('Password matches "1234":', match);
        } else {
            console.log('Not found in UNIVERSITIES collection');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

const targetEmail = process.argv[2];
if (!targetEmail) {
    console.error('Please provide an email');
    process.exit(1);
}
debugUser(targetEmail);
