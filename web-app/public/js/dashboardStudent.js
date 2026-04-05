/*
 * ============================================================================
 * FILE: web-app/public/js/dashboardStudent.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles frontend logic for the Student Dashboard UI.
 *   Specifically manages the "Share Data" modal interactions where a student
 *   generates a Zero Knowledge Proof to share with employers.
 * ============================================================================
 */


/*
 * WHAT: jQuery event listener that triggers just before the Share Data modal becomes visible.
 * WHY: When a user clicks 'Share Data' on a specific certificate card, this extracts
 *   the unique certificate ID (`data-certid`) from the button they clicked, and
 *   attaches it to the Modal itself. This allows a single Modal HTML structure 
 *   to handle any number of certificates dynamically.
 */
$('#shareDataModal').on('show.bs.modal', function (event) {
    var button = $(event.relatedTarget); // Button that triggered the modal
    var certID = button.data('certid'); // Extract info from data-* attributes

    var modal = $(this);
    // Store certID in data attribute for later use when clicking 'Generate Proof'
    modal.data('certid', certID);
});


/*
 * WHAT: AJAX call to generate the mathematical ZKP based on the user's selected checkboxes.
 */
$("#modalCreateProof").on('click', function (event) {
    
    // 1. Grab all the selected checkboxes from the `<form id="shareForm">`
    let certData = $("#shareForm").serializeArray().map(function (v) { return v.name; });
    // 2. Grab the certificate ID we parked securely on the modal earlier
    let certUUID = $('#shareDataModal').data('certid');
    
    certData = { "sharedAttributes": certData, certUUID };
    console.log(certData);

    // Send to backend Node.js API (api-router.js)
    $.ajax({
        url: "../api/generateProof",
        type: "GET",
        data: certData,
        success: function (result) {
            console.log("Success");
            console.log(JSON.stringify(result));

            // Hide the form, show the success state
            let successModal = $('#shareSuccessModal');
            let modalBody = successModal.find("#shareSuccessModalBody");

            // Build dynamic HTML content with QR code and proof JSON
            let content = '';

            // If the backend generated a QR Code string (base64 Image URL)
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
            
            // Educational UX note: If they select all fields, there is no need for cryptographic hashing
            // because there are no hidden fields to protect.
            if (result.proof.length === 0) {
                content += '<div class="alert alert-info py-1" style="font-size: 0.85rem;"><strong>Note:</strong> Full disclosure selected. No hash proof required for verification.</div>';
            }
            
            // Output the JSON string they need to copy/paste directly
            content += '<textarea class="form-control" rows="4" readonly onclick="this.select()">' + JSON.stringify({ proof: result.proof, disclosedData: result.disclosedData, certUUID: result.certUUID }) + '</textarea>';
            content += '<small class="text-muted">Click the text above to select all, then copy and share with the verifier.</small>';
            content += '</div>';

            modalBody.html(content);
            successModal.modal('show');
        },
        error: function (result) {
            // Usually triggers if no checkboxes were selected or they don't own the cert
            console.error("Failure generating proof");
            let failModal = $('#shareFailModal');
            failModal.find("#shareFailModalBody").text(JSON.stringify(result));
            failModal.modal('show');
        }
    });
});