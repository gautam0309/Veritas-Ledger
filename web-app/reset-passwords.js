const mongoose = require('mongoose');
const students = require('./database/models/students');
const universities = require('./database/models/universities');
require('dotenv').config({ path: './.env' });

async function resetPasswords() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27014/VeritasLedger', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to database.');

        const newPassword = '1234';

        // Update Students
        console.log('Updating students...');
        const studentList = await students.find({});
        for (const student of studentList) {
            student.password = newPassword;
            await student.save();
        }
        console.log(`Updated ${studentList.length} students.`);

        // Update Universities
        console.log('Updating universities...');
        const universityList = await universities.find({});
        for (const university of universityList) {
            university.password = newPassword;
            await university.save();
        }
        console.log(`Updated ${universityList.length} universities.`);

        console.log('All passwords reset successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error resetting passwords:', error);
        process.exit(1);
    }
}

resetPasswords();
