/*
 * ============================================================================
 * FILE: web-app/public/js/dashboardUniversity.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles frontend logic for the University Dashboard UI.
 *   Uses Chart.js to render complex analytics graphs and handles data-fetching.
 *   Also manages the Hash UI modals for verifying unchangeable Ledger states.
 * ============================================================================
 */


$(document).ready(function () {
    // Keep track of Chart.js objects so we can cleanly destroy/redraw them 
    // when the user changes Date filters without causing canvas overlaps
    let issuanceChart = null;
    let deptChart = null;

    /*
     * WHAT: Reusable AJAX wrapper to hit our `university-controller.js` API endpoint
     */
    function fetchAnalytics(range, startDate, endDate) {
        let url = '/university/api/analytics?range=' + range;
        if (range === 'custom' && startDate && endDate) {
            url += '&startDate=' + startDate + '&endDate=' + endDate;
        }

        $.ajax({
            url: url,
            method: 'GET',
            success: function (data) {
                // Takes the JSON payload from the API and hands it to Chart.js
                renderCharts(data);
            },
            error: function (err) {
                console.error('Failed to fetch analytics data', err);
            }
        });
    }

    // Initial fetch on page load (defaults to 6 months)
    fetchAnalytics('6m');

    // Time range dropdown listener
    $('#timeRange').on('change', function () {
        const val = $(this).val();
        const text = $(this).find('option:selected').text();

        // Reveal the specific date-picker inputs only if "Custom" is selected
        if (val === 'custom') {
            $('#customDateRange').removeClass('d-none').addClass('d-flex');
            $('#chartTitle').text('Certificates Issued (Custom Range)');
        } else {
            $('#customDateRange').addClass('d-none').removeClass('d-flex');
            $('#chartTitle').text('Certificates Issued (' + text + ')');
            fetchAnalytics(val);
        }
    });

    // Custom Date "Apply" Button Listener
    $('#applyCustomDate').on('click', function () {
        const start = $('#startDate').val();
        const end = $('#endDate').val();

        if (!start || !end) {
            alert("Please select both start and end dates.");
            return;
        }

        // Prevent illogical time gaps
        if (new Date(start) > new Date(end)) {
            alert("Start date must be before end date.");
            return;
        }

        fetchAnalytics('custom', start, end);
    });

    /*
     * WHAT: Maps the raw JSON numbers mapped from MongoDB Aggregations into 
     *   visual browser graphs via Chart.js
     */
    function renderCharts(data) {
        
        // 1. Issuance Chart (Time-Series Line Chart)
        const ctxIssuance = document.getElementById('issuanceChart').getContext('2d');
        // Extract strictly the Dates (X axis) mapping from the JSON array
        const labelsIssuance = data.timeStats.map(item => item._id);
        // Extract strictly the Counts (Y axis)
        const countsIssuance = data.timeStats.map(item => item.count);

        if (issuanceChart) issuanceChart.destroy();

        issuanceChart = new Chart(ctxIssuance, {
            type: 'line',
            data: {
                labels: labelsIssuance,
                datasets: [{
                    label: 'Certificates Issued',
                    data: countsIssuance,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    tension: 0.4, // Makes the line curved instead of rigid right angles
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#64748b' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });

        // 2. Department Distribution (Doughnut/Pie Chart)
        const ctxDept = document.getElementById('deptChart').getContext('2d');
        const labelsDept = data.deptStats.map(item => item._id);
        const countsDept = data.deptStats.map(item => item.count);

        // Pre-defined color mapping for UI consistency across browser reloads
        const backgroundColors = [
            '#667eea', '#764ba2', '#43e97b', '#38f9d7', '#ff6b6b', '#feca57'
        ];

        if (deptChart) deptChart.destroy();

        deptChart = new Chart(ctxDept, {
            type: 'doughnut',
            data: {
                labels: labelsDept,
                datasets: [{
                    data: countsDept,
                    // Trims color array to match exactly the number of departments found
                    backgroundColor: backgroundColors.slice(0, Math.max(labelsDept.length, 1)),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '40%', // Thicker ring / bigger appearance
                plugins: {
                    legend: {
                        position: 'right',
                        align: 'center',
                        labels: {
                            color: '#64748b',
                            boxWidth: 12, // Smaller box to save space
                            padding: 10,  // Reduced padding
                            font: {
                                size: 11 // Slightly smaller font to fit more text
                            }
                        }
                    }
                },
                layout: {
                    padding: 5 // Minimal padding to maximize chart size
                }
            }
        });
    }

    /*
     * WHAT: Hash Toggle Listener (Modal Version)
     * WHY: The SHA256 crypto hashes generated by Hyperledger are very long strings.
     *   Rather than breaking our UI grid by trying to display them inline, we
     *   hide them in `<button data-full-hash="...">` elements, then show them in a popup.
     */
    $(document).on('click', '.toggle-hash', function () {
        const btn = $(this);
        const fullHash = btn.data('full-hash');

        // Set hash text in modal
        $('#modalHashText').text(fullHash);

        // Show modal
        $('#hashModal').modal('show');
    });

    // Initialize feather icons for dynamic SVG graphic injection throughout UI
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});
