const PORT = 3000;
const URL_PREFIX = '/knock';

const express = require('express');
const app = express();
const router = express.Router();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    path: `${URL_PREFIX}/socket.io/`
});

app.use(`${URL_PREFIX}`, router)

// we serve up the client page, and client socket.io library
router.get('/', (req, res) => {
    res.sendFile(__dirname + '/pages/knock.html');
});
router.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js')
});

// we leave odd participants (with nobody to pair up with) here .. temporarily
let participantWithoutPartner = null;

// a "participant" holds a reference to
// - its client web socket
// - the other participant it is paired with
// it has functionality to
// - return its socket id (for logging)
// - pair up
// - unpair
// - handle disconnection
// - and send it's paired participant a knock
function participant(socket = {}) {
    this.socket = socket;
    this.pairedParticipant = null;
    this.getId = function() {
        return this.socket.id
    };
    this.pairWith = function(participant) {
        this.pairedParticipant = participant
        this.socket.on('knock', this.sendKnock.bind(this))
    };
    this.unpair = function() {
        this.socket.listeners('knock').forEach(function (listener) {
            this.socket.off('knock', listener);
        }.bind(this))
        this.pairedParticipant = null;
    };
    this.onDisconnect = function() {
        if (this.pairedParticipant !== null) {
            this.pairedParticipant.unpair();
            handleAvaliableParticipant(this.pairedParticipant);
            this.unpair();
        } else {
            participantWithoutPartner = null;
        }
    }
    this.sendKnock = function() {
        console.log(this.socket.id, 'sending knock', this.pairedParticipant.socket.id);
        this.pairedParticipant.socket.emit('knock');
    }
}

// just a helper function to make two participants pair up with each other
function makePairing(participantOne, participantTwo) {
    participantOne.pairWith(participantTwo);
    participantTwo.pairWith(participantOne);
}

// when a participant becomes available (either by joining, or their partner leaving)
// - we check to see if there's another participant to pair with
// - if there isn't, we keep this one in the temporary "participantWithoutPartner" holding place
// - if there is, we pair them up
function handleAvaliableParticipant(availableParticipant) {
    if (participantWithoutPartner == null) {
        console.log('queueing participant', availableParticipant.getId());
        participantWithoutPartner = availableParticipant;
    } else {
        console.log('pairing participants', availableParticipant.getId(), participantWithoutPartner.getId());
        makePairing(availableParticipant, participantWithoutPartner);
        participantWithoutPartner = null;
    }
}

// when a new socket connection is made
// - we make a participant out of it
// - hand handle the newly created participant
io.on('connection', (socket) => {
    console.log('a participant connected', socket.id);
    let newParticipant = new participant(socket);
    handleAvaliableParticipant(newParticipant);
    
    // when a socket disconnects
    // - we make sure to handle clean-up (unpairing/erasure)
    socket.on('disconnect', function() {
        console.log('participant disconnected', socket.id);
        newParticipant.onDisconnect();
    });
});

// start the server listening for connections
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});