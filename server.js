const express = require('express');
const socketIO = require('socket.io');
const url = require('url');

const PORT = process.env.PORT || 3001;

const rootUrl = (req) => {
    let s = Object.assign(new URL("http://example.com/"), {
        protocol: req.protocol,
        host: req.get('host')
    });
    return s;
};

const server = express()
    .use(express.json())
    .set('trust proxy', true)
    .post('/api/emit', (req, res) => {
        console.log({
            ip: req.ip,
            room: req.body.room,
            design: req.body.design
        });
        io.to(req.body.room).emit('spawn', req.body.design);
        res.send("ok");
    })
    .use(express.static('public'))
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

io.on('connection', (socket) => {
    console.log({
        id: socket.id,
        event: 'connect',
    });
    socket.on("join", (room) => {
        console.log({
            id: socket.id,
            event: 'join',
            room: room
        });
        socket.join(room);
    });
    socket.on('disconnect', () => console.log({
        id: socket.id,
        event: 'disconnect'
    }));
});

