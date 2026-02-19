
$(document).ready(function () {
    // Fetch Analytics Data
    $.ajax({
        url: '/university/api/analytics',
        method: 'GET',
        success: function (data) {
            renderCharts(data);
        },
        error: function (err) {
            console.error('Failed to fetch analytics data', err);
        }
    });

    function renderCharts(data) {
        // 1. Issuance Chart (Line Chart)
        const ctxIssuance = document.getElementById('issuanceChart').getContext('2d');
        const labelsIssuance = data.timeStats.map(item => item._id);
        const countsIssuance = data.timeStats.map(item => item.count);

        new Chart(ctxIssuance, {
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
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a8a8b3', stepSize: 1 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a8a8b3' }
                    }
                }
            }
        });

        // 2. Department Distribution (Doughnut Chart)
        const ctxDept = document.getElementById('deptChart').getContext('2d');
        const labelsDept = data.deptStats.map(item => item._id);
        const countsDept = data.deptStats.map(item => item.count);
        // Generate colors dynamically
        const backgroundColors = [
            '#667eea', '#764ba2', '#43e97b', '#38f9d7', '#ff6b6b', '#feca57'
        ];

        new Chart(ctxDept, {
            type: 'doughnut',
            data: {
                labels: labelsDept,
                datasets: [{
                    data: countsDept,
                    backgroundColor: backgroundColors.slice(0, labelsDept.length),
                    borderColor: 'rgba(30, 27, 60, 0.95)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }
});
