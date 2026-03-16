$(document).ready(function () {
    let issuanceChart = null;
    let deptChart = null;

    function fetchAnalytics(range, startDate, endDate) {
        let url = '/university/api/analytics?range=' + range;
        if (range === 'custom' && startDate && endDate) {
            url += '&startDate=' + startDate + '&endDate=' + endDate;
        }

        $.ajax({
            url: url,
            method: 'GET',
            success: function (data) {
                renderCharts(data);
            },
            error: function (err) {
                console.error('Failed to fetch analytics data', err);
            }
        });
    }

    // Initial fetch
    fetchAnalytics('6m');

    // Time range listener
    $('#timeRange').on('change', function () {
        const val = $(this).val();
        const text = $(this).find('option:selected').text();

        if (val === 'custom') {
            $('#customDateRange').removeClass('d-none').addClass('d-flex');
            $('#chartTitle').text('Certificates Issued (Custom Range)');
        } else {
            $('#customDateRange').addClass('d-none').removeClass('d-flex');
            $('#chartTitle').text('Certificates Issued (' + text + ')');
            fetchAnalytics(val);
        }
    });

    // Custom Date Apply Listener
    $('#applyCustomDate').on('click', function () {
        const start = $('#startDate').val();
        const end = $('#endDate').val();

        if (!start || !end) {
            alert("Please select both start and end dates.");
            return;
        }

        if (new Date(start) > new Date(end)) {
            alert("Start date must be before end date.");
            return;
        }

        fetchAnalytics('custom', start, end);
    });

    function renderCharts(data) {
        // 1. Issuance Chart (Line Chart)
        const ctxIssuance = document.getElementById('issuanceChart').getContext('2d');
        const labelsIssuance = data.timeStats.map(item => item._id);
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
                    tension: 0.4,
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

        // 2. Department Distribution (Doughnut Chart)
        const ctxDept = document.getElementById('deptChart').getContext('2d');
        const labelsDept = data.deptStats.map(item => item._id);
        const countsDept = data.deptStats.map(item => item.count);

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
    // Hash Toggle Listener
    // Hash Toggle Listener (Modal Version)
    $(document).on('click', '.toggle-hash', function () {
        const btn = $(this);
        const fullHash = btn.data('full-hash');

        // Set hash text in modal
        $('#modalHashText').text(fullHash);

        // Show modal
        $('#hashModal').modal('show');
    });

    // Initialize feather icons for dynamic content
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});
