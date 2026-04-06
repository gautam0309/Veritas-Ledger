const mongoose = require('mongoose');
require('dotenv').config();

const FabricIdentity = require('./database/models/fabric-identity');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const id = await FabricIdentity.findOne({ label: '2301201182@krmu.edu.in' });
    if (!id) {
        console.log('User not found');
        process.exit(1);
    }
    
    console.log('Label:', id.label);
    const data = JSON.parse(id.identity);
    console.log('Type:', data.type);
    const key = data.credentials.privateKey;
    console.log('Key Length:', key.length);
    console.log('Key First 30:', JSON.stringify(key.substring(0, 30)));
    console.log('Key Last 30:', JSON.stringify(key.substring(key.length - 30)));
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
