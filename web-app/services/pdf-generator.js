/*
 * ============================================================================
 * FILE: web-app/services/pdf-generator.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Dynamically generates a styled PDF version of the certificate on the fly.
 *   
 * HOW IT WORKS:
 *   - Uses PDFKit to draw shapes, text, and lines programmatically.
 *   - Fetches the certificate data from MongoDB.
 *   - Generates a QR code pointing to the verification page and embeds it.
 *   - Returns a raw binary buffer that the controller streams back to the browser.
 * ============================================================================
 */

// WHAT: A PDF generation library for Node.js
const PDFDocument = require('pdfkit');

// WHAT: Generates QR Code images from text/urls
const QRCode = require('qrcode');
const path = require('path');

/**
 * Generate a styled PDF certificate and return it as a buffer
 * @param {Object} certData - Certificate data
 * @returns {Promise<Buffer>} PDF buffer
 */

/*
 * ===== FUNCTION: generateCertificatePDF =====
 * WHAT: Draws the actual PDF document layer by layer (Background -> Borders -> Text -> Image).
 */
async function generateCertificatePDF(certData) {
    // We wrap this in a Promise because PDF generation uses Streams, which are async by nature.
    return new Promise(async (resolve, reject) => {
        try {
            // Initialize a new landscape A4 document
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margins: { top: 40, bottom: 40, left: 50, right: 50 }
            });

            // WHAT: A holding array for the binary chunks of the PDF
            let buffers = [];
            // As PDFKit generates data, push it into our array
            doc.on('data', buffers.push.bind(buffers));
            // When PDFKit is finished, combine all chunks into one Buffer and resolve the Promise
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;

            // --- DRAWING THE PDF ---

            // Background gradient effect (solid dark)
            doc.rect(0, 0, pageWidth, pageHeight).fill('#1a1a2e');

            // Decorative border (Outer)
            doc.rect(20, 20, pageWidth - 40, pageHeight - 40)
                .lineWidth(2)
                .strokeColor('#667eea')
                .stroke();

            // Decorative border (Inner)
            doc.rect(30, 30, pageWidth - 60, pageHeight - 60)
                .lineWidth(0.5)
                .strokeColor('#38f9d7')
                .stroke();

            // Corner accents (Little squares in the corners)
            const corners = [
                [25, 25], [pageWidth - 45, 25],
                [25, pageHeight - 45], [pageWidth - 45, pageHeight - 45]
             ];
            corners.forEach(([x, y]) => {
                doc.rect(x, y, 20, 20).lineWidth(1.5).strokeColor('#667eea').stroke();
             });

            // Header - "Certificate of Achievement"
            doc.fontSize(14)
                .fillColor('#38f9d7')
                .text('VERITAS LEDGER — BLOCKCHAIN VERIFIED', 0, 60, { align: 'center' });

            doc.fontSize(36)
                .fillColor('#ffffff')
                .text('Certificate of Achievement', 0, 90, { align: 'center' });

            doc.moveTo(pageWidth / 2 - 150, 140)
                .lineTo(pageWidth / 2 + 150, 140)
                .lineWidth(1)
                .strokeColor('#667eea')
                .stroke();

            // Document body text
            // "This is to certify that"
            doc.fontSize(13)
                .fillColor('#cccccc')
                .text('This is to certify that', 0, 160, { align: 'center' });

            // Student Name (Dynamic from DB)
            doc.fontSize(30)
                .fillColor('#38f9d7')
                .text(certData.studentName || 'Student Name', 0, 185, { align: 'center' });

            // Details
            doc.fontSize(13)
                .fillColor('#cccccc')
                .text('has successfully completed the requirements for', 0, 230, { align: 'center' });

            doc.fontSize(20)
                .fillColor('#ffffff')
                .text(certData.major || 'Major', 0, 255, { align: 'center' });

            doc.fontSize(13)
                .fillColor('#cccccc')
                .text(`from the Department of ${certData.departmentName || 'Department'}`, 0, 285, { align: 'center' });

            doc.fontSize(13)
                .fillColor('#cccccc')
                .text(`at`, 0, 310, { align: 'center' });

            // Issuing University
             doc.fontSize(18)
                .fillColor('#667eea')
                 .text(certData.universityName || 'University', 0, 330, { align: 'center' });

            // CGPA & Date row
             const detailY = 370;
            doc.fontSize(11).fillColor('#999999');

             doc.text(`Roll Number: ${certData.rollNumber || 'N/A'}`, 100, detailY);
             doc.text(`CGPA: ${certData.cgpa || 'N/A'} / 10`, pageWidth / 2 - 40, detailY);
            doc.text(`Date of Issue: ${certData.dateOfIssuing || 'N/A'}`, pageWidth - 300, detailY);

            // Divider line below stats
            doc.moveTo(100, detailY + 25)
                .lineTo(pageWidth - 100, detailY + 25)
                 .lineWidth(0.5)
                .strokeColor('#444')
                .stroke();

            // Certificate UUID and Hash (Important for manual verification)
            doc.fontSize(9)
                .fillColor('#666666')
                .text(`Certificate ID: ${certData.certUUID || 'N/A'}`, 100, detailY + 35);

             if (certData.hash) {
                 doc.text(`Blockchain Hash: ${certData.hash}`, 100, detailY + 50);
             }

             // QR code – encode verification URL
             // WHAT: Anyone holding the printed PDF can scan this to open the public portal
             try {
                // The URL they will be sent to
                const verifyUrl = `http://localhost:4000/verify`;
                
                // Generate the QR as a Base64 string
                 const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 100, margin: 1, color: { dark: '#667eea', light: '#1a1a2e' } });
                
                // Convert Base64 back to binary Buffer so PDFKit can attach it
                const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
                 doc.image(qrBuffer, pageWidth - 170, detailY + 30, { width: 80 });
                doc.fontSize(8).fillColor('#666666').text('Scan to verify', pageWidth - 170, detailY + 115, { width: 80, align: 'center' });
            } catch (qrErr) {
                 // QR generation failed, skip
             }

             // Blockchain verification stamp
             doc.fontSize(10)
                 .fillColor('#38f9d7')
                .text('✓ VERIFIED ON HYPERLEDGER FABRIC BLOCKCHAIN', 0, pageHeight - 70, { align: 'center' });

             // Tell PDFKit we are done drawing. This triggers the `doc.on('end')` event above.
            doc.end();
         } catch (err) {
             reject(err);
         }
     });
 }

module.exports = { generateCertificatePDF };
