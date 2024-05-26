document.addEventListener('DOMContentLoaded', function (event) {
    let roomName = decodeURIComponent(location.hash.slice(1));

    if (!roomName) {
        roomName = prompt('room name?');
        window.history.pushState(null, null, '#' + roomName);
    }

    const form = document.getElementById("form");
    const nicknameElm = document.getElementById("nickname");
    const vElm = document.getElementById("val-v");
    const KpElm = document.getElementById("val-Kp");

    const getDisplayName = (n) => {
        let dn = n;
        let tmp = n.split('+');
        if (tmp.length >= 2) {
            tmp.pop();
            dn = tmp.join('+');
        }
        return dn;
    }


    form.addEventListener('submit', function (event) {
        event.preventDefault();


        fetch('/api/emit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                room: roomName,
                design:{
                    nickname: nicknameElm.value,
                    v: vElm.value,
                    Kp: KpElm.value,
                    Td: 0
                }
            }),
        })
    });
    renderMathInElement(document.body, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false},
            {left: '\\[', right: '\\]', display: true}
        ],
        throwOnError : false
      });  
});
