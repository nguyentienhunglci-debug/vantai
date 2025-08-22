document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('transport-quote-form');

    form.addEventListener('submit', function(event) {
        const phoneInput = document.getElementById('phone');
        
        // Đơn giản là kiểm tra nếu SĐT trống
        if (phoneInput.value.trim() === '') {
            event.preventDefault(); // Ngăn form gửi đi
            alert('Vui lòng nhập số điện thoại để chúng tôi liên hệ!');
            phoneInput.focus();
        } else {
            // Có thể thêm các logic phức tạp hơn ở đây
            console.log('Form đã sẵn sàng để gửi đi!');
        }
    });
});
