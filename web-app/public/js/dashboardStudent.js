$('#shareDataModal').on('show.bs.modal', function (event) {
    var button = $(event.relatedTarget); // Button that triggered the modal
    var certID = button.data('certid'); // Extract info from data-* attributes

    var modal = $(this);
    // Store certID in data attribute for later use
    modal.data('certid', certID);
});


$("#modalCreateProof").on('click', function (event) {
    let certData = $("#shareForm").serializeArray().map(function (v) { return v.name; });
    let certUUID = $('#shareDataModal').data('certid');
    certData = { "sharedAttributes": certData, certUUID };
    console.log(certData);

    $.ajax({
        url: "../api/generateProof",
        type: "GET",
        data: certData,
        success: function (result) {
            console.log("Success");
            console.log(JSON.stringify(result));

            let successModal = $('#shareSuccessModal');
            let modalBody = successModal.find("#shareSuccessModalBody");

            // Build content with QR code and proof JSON
            let content = '';

            if (result.qrCode) {
                content += '<div class="text-center mb-3">';
                content += '<h6>Scan this QR Code to verify:</h6>';
                content += '<img src="' + result.qrCode + '" alt="Verification QR Code" style="max-width: 250px; border: 2px solid #ddd; border-radius: 8px; padding: 5px;">';
                content += '<br><small class="text-muted">Employer scans this QR → automatically verifies the certificate</small>';
                content += '</div>';
                content += '<hr>';
            }

            content += '<div class="mb-2">';
            content += '<h6>Proof Object (for manual verification):</h6>';
            content += '<textarea class="form-control" rows="4" readonly onclick="this.select()">' + JSON.stringify({ proof: result.proof, disclosedData: result.disclosedData, certUUID: result.certUUID }) + '</textarea>';
            content += '<small class="text-muted">Click the text above to select all, then copy and share with the verifier.</small>';
            content += '</div>';

            modalBody.html(content);
            successModal.modal('show');
        },
        error: function (result) {
            console.error("Failure generating proof");
            let failModal = $('#shareFailModal');
            failModal.find("#shareFailModalBody").text(JSON.stringify(result));
            failModal.modal('show');
        }
    });
});