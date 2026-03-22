// eg UniversitySchema = {
//     dataType : "schema",
//     id: "v1",
//     ordering: ["studentName", "studentEmail", "universityName", "universityEmail", "major", "departmentName", "cgpa"],
//     certificateType: "university degree"
// }


class Schema {
    
    constructor(certificateType, id, ordering){
        this.certificateType = certificateType;
        this.id = id;
        this.ordering = ordering;
        this.dataType = "schema"
    }
    
    
    
    
    static deserialize(data) {
        return new Schema(data.certificateType, data.id, data.ordering);
    }
    
}

module.exports = Schema; 