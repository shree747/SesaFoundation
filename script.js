// Hero Slider replaced by CSS Marquee


// Countdown Logic
const countdownDate = new Date().getTime() + (14 * 24 * 60 * 60 * 1000); // 14 days from now

const x = setInterval(function () {
    const now = new Date().getTime();
    const distance = countdownDate - now;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById("days").innerHTML = days < 10 ? '0' + days : days;
    document.getElementById("hours").innerHTML = hours < 10 ? '0' + hours : hours;
    document.getElementById("mins").innerHTML = minutes < 10 ? '0' + minutes : minutes;
    document.getElementById("secs").innerHTML = seconds < 10 ? '0' + seconds : seconds;

    if (distance < 0) {
        clearInterval(x);
        document.querySelector(".timer").innerHTML = "RACE STARTED";
    }
}, 1000);




// Form Submission handling (prevent default)
document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Sending...';
    setTimeout(() => {
        btn.innerHTML = 'Welcome to the Foundation!';
        btn.style.background = '#4CAF50';
        btn.style.borderColor = '#4CAF50';
        e.target.reset();
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.style.borderColor = '';
        }, 3000);
    }, 1500);
});
