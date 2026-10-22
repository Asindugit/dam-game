const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(__dirname));

function initialBoard() {
  const b = Array.from({length:10}, () => Array(10).fill(null));
  for(let r=0;r<4;r++) for(let c=0;c<10;c++) if((r+c)%2===1) b[r][c]={color:'black',king:false};
  for(let r=6;r<10;r++) for(let c=0;c<10;c++) if((r+c)%2===1) b[r][c]={color:'white',king:false};
  return b;
}
io.on('connection', socket => {
  socket.on('joinRoom', ({roomCode}) => {
    const code=String(roomCode||'').replace(/[^a-z0-9]/gi,'').slice(0,12).toUpperCase();
    if(!code){socket.emit('roomError','Enter a valid room code.');return}
    let room=rooms.get(code);
    if(!room){room={board:initialBoard(),turn:'white',players:{},forced:null,gameOver:false};rooms.set(code,room)}
    if(Object.keys(room.players).length>=2 && !room.players[socket.id]){socket.emit('roomError','This room is full.');return}
    const used=Object.values(room.players);
    const color=used.includes('white')?'black':'white';
    room.players[socket.id]=color;socket.join(code);socket.data.roomCode=code;socket.data.color=color;
    socket.emit('roomJoined',{roomCode:code,color,board:room.board,turn:room.turn});
    io.to(code).emit('state',{board:room.board,turn:room.turn,forced:room.forced,gameOver:room.gameOver,message:`Room ${code} ready. ${room.turn} moves first.`});
  });
  socket.on('move', ({roomCode,move}) => {
    const room=rooms.get(socket.data.roomCode);
    if(!room||room.gameOver||!move||socket.data.roomCode!==roomCode)return;
    if(room.players[socket.id]!==room.turn)return;
    const {from,to,capture}=move;
    const validPos=p=>p&&Number.isInteger(p.r)&&Number.isInteger(p.c)&&p.r>=0&&p.r<10&&p.c>=0&&p.c<10;
    if(!validPos(from)||!validPos(to))return;
    const piece=room.board[from.r][from.c];
    if(!piece||piece.color!==room.turn||room.board[to.r][to.c])return;
    if(capture){if(!validPos(capture))return;const victim=room.board[capture.r][capture.c];if(!victim||victim.color===piece.color)return;room.board[capture.r][capture.c]=null}
    room.board[from.r][from.c]=null;room.board[to.r][to.c]=piece;
    if((piece.color==='white'&&to.r===0)||(piece.color==='black'&&to.r===9))piece.king=true;
    room.forced=null;room.turn=room.turn==='white'?'black':'white';
    const counts={white:0,black:0};room.board.flat().forEach(p=>{if(p)counts[p.color]++});
    if(!counts.white||!counts.black)room.gameOver=true;
    io.to(roomCode).emit('state',{board:room.board,turn:room.turn,forced:room.forced,gameOver:room.gameOver,message:room.gameOver?`${counts.white?'White':'Black'} wins!`:`${room.turn} to move.`});
  });
  socket.on('disconnect',()=>{
    const code=socket.data.roomCode,room=rooms.get(code);if(!room)return;
    delete room.players[socket.id];
    io.to(code).emit('state',{board:room.board,turn:room.turn,forced:room.forced,gameOver:room.gameOver,message:'A player disconnected.'});
    if(!Object.keys(room.players).length)rooms.delete(code);
  });
});
server.listen(PORT,()=>console.log(`Dam Online running at http://localhost:${PORT}`));
