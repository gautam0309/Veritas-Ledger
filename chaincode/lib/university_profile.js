'use strict';




class UniversityProfile {
    
    constructor(name, publicKey, location, description, email = "") {
        this.name = name;
        this.publicKey = publicKey;
        this.location = location;
        this.description = description;
        this.email = email;
        this.dataType = "university"
    }



    

    static deserialize(data) {
        return new UniversityProfile(data.name, data.publicKey, data.location, data.description, data.email);
    }
}

module.exports = UniversityProfile;