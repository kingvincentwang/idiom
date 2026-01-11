(function() {
    // --- 設定區 ---
    const TARGET_DATE_STRING = "2026-01-01T00:00:00"; // 修改這裡的時間
    // -------------

    const targetDate = new Date(TARGET_DATE_STRING);
    const wrapper = document.getElementById('timer-block');
    const daysEl = wrapper.querySelector('#days');
    const hoursEl = wrapper.querySelector('#hours');
    const minutesEl = wrapper.querySelector('#minutes');
    const secondsEl = wrapper.querySelector('#seconds');
    const headline = wrapper.querySelector('#headline');
    const countdownEl = wrapper.querySelector('#countdown');
    const celebrationEl = wrapper.querySelector('#celebration');
    const cheerAudio = wrapper.querySelector('#cheerAudio');
    const canvas = wrapper.querySelector('#fireworksCanvas');
    const ctx = canvas.getContext('2d');

    let intervalId;
    let isCelebrating = false;

    // 音效解鎖
    function unlockAudio() {
        cheerAudio.volume = 0.1;
        cheerAudio.play().then(() => {
            cheerAudio.pause();
            cheerAudio.currentTime = 0;
            cheerAudio.volume = 1.0;
        }).catch(() => {});
        document.body.removeEventListener('click', unlockAudio);
    }
    document.body.addEventListener('click', unlockAudio);

    // 倒數邏輯
    function startCountdown() {
        updateTimer();
        intervalId = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = new Date().getTime();
        const distance = targetDate.getTime() - now;

        if (distance < 0) {
            clearInterval(intervalId);
            if (!isCelebrating) showCelebration();
            return;
        }

        daysEl.innerText = String(Math.floor(distance / (1000 * 60 * 60 * 24))).padStart(2, '0');
        hoursEl.innerText = String(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
        minutesEl.innerText = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
        secondsEl.innerText = String(Math.floor((distance % (1000 * 60)) / 1000)).padStart(2, '0');
    }

    function showCelebration() {
        countdownEl.style.display = 'none';
        celebrationEl.style.display = 'block';
        headline.innerText = "";
        isCelebrating = true;
        loopFireworks();
        cheerAudio.play().catch(()=>{});
    }

    // Canvas 尺寸調整 (針對區塊)
    let particles = [];
    function resizeCanvas() {
        // 使用 offsetWidth/Height 確保取得包含 padding 的正確尺寸
        canvas.width = wrapper.offsetWidth;
        canvas.height = wrapper.offsetHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    // 稍微延遲執行 resize 以確保 CSS 渲染完成
    setTimeout(resizeCanvas, 100);

    // 煙火邏輯
    function createFirework(x, y) {
        const particleCount = 80;
        const colors = ['#ff0043', '#14fc56', '#1e90ff', '#ffe100', '#ffffff'];
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: x, y: y,
                color: colors[Math.floor(Math.random() * colors.length)],
                radius: Math.random() * 2,
                velocity: { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 },
                alpha: 1, decay: Math.random() * 0.02 + 0.01
            });
        }
    }

    function loopFireworks() {
        if (!isCelebrating) return;
        requestAnimationFrame(loopFireworks);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (Math.random() < 0.05) createFirework(Math.random() * canvas.width, Math.random() * canvas.height * 0.6);

        particles.forEach((p, i) => {
            if (p.alpha > 0) {
                p.velocity.y += 0.05;
                p.x += p.velocity.x; p.y += p.velocity.y;
                p.alpha -= p.decay;
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.fill();
            } else particles.splice(i, 1);
        });
    }

    startCountdown();
})();
