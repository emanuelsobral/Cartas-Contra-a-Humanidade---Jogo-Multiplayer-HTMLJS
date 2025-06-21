import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Definição de cartas de exemplo (será carregada de cartas.json)
let exampleBlackCards = [];
let exampleWhiteCards = [];

// Helper para embaralhar arrays
const shuffleArray = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
};

// Variáveis globais do Firebase e estado do jogo
let db;
let auth;
let userId = null;
let userName = '';
let roomId = '';
let currentRoom = null;
let selectedWhiteCards = [];
let isAuthReady = false;
let aiPlayerId = 'ai_player_1'; // ID fixo para o jogador IA

// Variáveis do temporizador
let voteTimer = null; // Guarda o setTimeout para a contagem final
let timerInterval = null; // Guarda o setInterval para atualizar a UI do temporizador
const voteDurationSeconds = 20; // Duração da fase de votação em segundos

// O appId para o caminho do Firestore deve ser o projectId do seu firebaseConfig
const appId = firebaseConfig.projectId;

// Elementos UI
const loadingScreen = document.getElementById('loading-screen');
const authSection = document.getElementById('auth-section');
const gameSection = document.getElementById('game-section');
const userIdDisplay = document.getElementById('user-id-display');
const userNameDisplay = document.getElementById('user-name-display');
const userNameInput = document.getElementById('user-name-input');
const roomInput = document.getElementById('room-input');
const createRoomButton = document.getElementById('create-room-button');
const joinRoomButton = document.getElementById('join-room-button');
const errorMessageDiv = document.getElementById('error-message');
const infoMessageDiv = document.getElementById('info-message');
const enableAiCheckbox = document.getElementById('enable-ai-checkbox');

const roomIdDisplay = document.getElementById('room-id-display');
const playersList = document.getElementById('players-list');
const startGameButton = document.getElementById('start-game-button');
const waitingHostMessage = document.getElementById('waiting-host-message');
const deleteRoomButton = document.getElementById('delete-room-button');
const leaveRoomButton = document.getElementById('leave-room-button'); 

const inGameArea = document.getElementById('in-game-area');
const currentBlackCardDiv = document.getElementById('current-black-card');
const playedCardsReviewArea = document.getElementById('played-cards-review-area'); 
const reviewStatusMessage = document.getElementById('review-status-message'); 
const playedCardsTitle = document.getElementById('played-cards-title'); 
const playedWhiteCardsGrid = document.getElementById('played-white-cards-grid');
const noCardsPlayedMessage = document.getElementById('no-cards-played-message');
const votingWaitingMessage = document.getElementById('voting-waiting-message'); 
const timerDisplay = document.getElementById('timer-display'); 
const timerText = document.getElementById('timer-text'); 
const timerProgressBar = document.getElementById('timer-progress-bar'); 

const playerHandView = document.getElementById('player-hand-view');
const playerHandTitle = document.getElementById('player-hand-title');
const playerHandGrid = document.getElementById('player-hand-grid');
const playCardsButton = document.getElementById('play-cards-button');
const hasPlayedMessage = document.getElementById('has-played-message');
const hasVotedMessage = document.getElementById('has-voted-message'); 

const endRoundArea = document.getElementById('end-round-area');
const roundWinnerDisplay = document.getElementById('round-winner-display');
const endRoundBlackCard = document.getElementById('end-round-black-card');
const endRoundWinningCard = document.getElementById('end-round-winning-card');
const nextRoundButton = document.getElementById('next-round-button');
const nextRoundWaitingMessage = document.getElementById('next-round-waiting-message');

// Modal elements
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseButton = document.getElementById('modal-close-button');

function showModal(title, message) {
    console.log('Mostrando modal:', title, message); 
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalOverlay.classList.remove('hidden');
    hideMessage(errorMessageDiv);
    hideMessage(infoMessageDiv);
}

function hideModal() {
    console.log('Escondendo modal - INÍCIO'); 
    modalOverlay.classList.add('hidden');
    modalTitle.textContent = '';
    modalMessage.textContent = '';
    hideMessage(errorMessageDiv);
    hideMessage(infoMessageDiv);
    updateUI(); 
    console.log('Escondendo modal - FIM'); 
}

modalCloseButton.addEventListener('click', hideModal);

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.remove('hidden');
    element.classList.remove(isError ? 'bg-blue-800' : 'bg-red-800'); 
    element.classList.add(isError ? 'bg-red-800' : 'bg-blue-800'); 
}

function hideMessage(element) {
    element.classList.add('hidden');
    element.textContent = '';
}

// Carrega as cartas do arquivo JSON
async function loadCards() {
    try {
        const response = await fetch('cartas.json');
        const data = await response.json();
        exampleBlackCards = data.blackCards;
        exampleWhiteCards = data.whiteCards;
        console.log("Cartas carregadas:", exampleBlackCards.length, exampleWhiteCards.length);
    } catch (error) {
        console.error("Erro ao carregar cartas do JSON:", error);
        showMessage(errorMessageDiv, "Erro ao carregar cartas do jogo. Recarregue a página.", true);
    }
}


// 1. Inicialização do Firebase e Autenticação
async function initFirebase() {
    if (!db) {
        console.log('Iniciando Firebase com config:', firebaseConfig); 
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Tenta logar com token customizado ou anonimamente
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token !== null) {
                await signInWithCustomToken(auth, __initial_auth_token);
                console.log('Autenticado com token customizado');
            } else {
                await signInAnonymously(auth);
                console.log('Autenticado anonimamente');
            }
        } catch (error) {
            console.error("Erro de autenticação do Firebase:", error);
            showMessage(errorMessageDiv, `Erro de autenticação: ${error.message}`, true);
        }

        // Listener para o estado de autenticação
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                const storedName = localStorage.getItem(`userName_${userId}`);
                if (storedName) {
                    userName = storedName;
                } else {
                    const randomName = `Jogador_${Math.random().toString(36).substring(2, 8)}`;
                    userName = randomName;
                    localStorage.setItem(`userName_${userId}`, randomName);
                }
                userNameInput.value = userName; 
                isAuthReady = true;
                loadingScreen.classList.add('hidden'); 
                updateUI();
                console.log('Estado de autenticação alterado, ID do usuário:', userId);
            } else {
                userId = null;
                isAuthReady = true;
                loadingScreen.classList.add('hidden'); 
                updateUI();
                console.log('Estado de autenticação alterado, nenhum usuário');
            }
        });
    }
}

// 2. Listener para o estado da sala atual
let unsubscribeRoomSnapshot = null;
function setupRoomListener() {
    if (unsubscribeRoomSnapshot) {
        unsubscribeRoomSnapshot(); 
    }
    if (!db || !userId || !roomId) {
        return;
    }

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    unsubscribeRoomSnapshot = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const oldStatus = currentRoom ? currentRoom.status : null; 
            currentRoom = data;
            console.log("Firestore: Dados da sala atualizados:", currentRoom); 
            updateUI();

            if (currentRoom.status === 'voting' && oldStatus !== 'voting' && currentRoom.hostId === userId) {
                startVotingTimer();
            } else if (currentRoom.status !== 'voting' && oldStatus === 'voting') {
                clearVotingTimer();
            }

            handleAiActions();

        } else {
            currentRoom = null;
            roomId = '';
            showModal('Sala Encerrada', 'A sala em que você estava foi encerrada ou não existe mais.');
            updateUI(); 
            console.log("Firestore: Sala não existe."); 
        }
    }, (error) => {
        console.error("Firestore: Erro ao escutar sala:", error); 
        showMessage(errorMessageDiv, `Erro ao carregar a sala: ${error.message}`, true);
    });
}

// --- Funções do Temporizador ---

function startVotingTimer() {
    console.log("Temporizador de votação iniciado.");
    clearVotingTimer(); 

    let timeLeft = voteDurationSeconds;
    timerText.textContent = `Tempo para votar: ${timeLeft}s`;
    timerProgressBar.style.width = '100%'; 
    timerDisplay.classList.remove('hidden');

    timerInterval = setInterval(() => {
        timeLeft--;
        timerText.textContent = `Tempo para votar: ${timeLeft}s`;
        timerProgressBar.style.width = `${(timeLeft / voteDurationSeconds) * 100}%`; 

        if (timeLeft <= 0) {
            clearVotingTimer();
            if (currentRoom && currentRoom.hostId === userId && currentRoom.status === 'voting') {
                console.log("Temporizador esgotado. Contando votos automaticamente (host).");
                tallyVotes();
            }
        }
    }, 1000); 
}

function clearVotingTimer() {
    if (voteTimer) {
        clearTimeout(voteTimer);
        voteTimer = null;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerDisplay.classList.add('hidden');
    timerText.textContent = '';
    timerProgressBar.style.width = '100%'; 
    console.log("Temporizador de votação limpo.");
}


// --- Funções de Lógica da IA ---

async function handleAiActions() {
    if (!currentRoom || !currentRoom.jogadores[aiPlayerId]) return; 

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) return;
    const latestRoomState = roomDoc.data();
    const aiData = latestRoomState.jogadores[aiPlayerId];

    if (!aiData) return; 

    // Lógica para IA puxar cartas
    if (latestRoomState.status === 'em_jogo' && aiData.hand.length < 7 && !latestRoomState.esperandoCartas[aiPlayerId]) {
         console.log(`IA ${aiPlayerId} preparando para puxar cartas.`);
         setTimeout(async () => {
             await dealWhiteCards(aiPlayerId);
         }, 500); 
    }

    // Lógica para IA jogar cartas brancas (se for em_jogo e não jogou ainda)
    if (latestRoomState.status === 'em_jogo' && !aiData.hasPlayed) {
        console.log(`IA ${aiPlayerId} preparando para jogar cartas.`);
        setTimeout(async () => {
            await aiPlayWhiteCards(aiPlayerId, latestRoomState.currentBlackCard.pick);
        }, 1500); 
    }

    // Lógica para IA votar (se for 'voting' e não votou ainda)
    if (latestRoomState.status === 'voting' && !latestRoomState.votes[aiPlayerId] && Object.keys(latestRoomState.playedWhiteCards).length > 0) {
         console.log(`IA ${aiPlayerId} preparando para votar.`);
         setTimeout(async () => {
             await aiCastVote(aiPlayerId, latestRoomState.playedWhiteCards);
         }, 1800); 
    }
}

async function aiPlayWhiteCards(aiId, blackCardPick) {
    console.log(`IA ${aiId} jogando cartas...`);
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) return;
    const latestRoomState = roomDoc.data();
    const aiHand = latestRoomState.jogadores[aiId]?.hand || [];

    if (aiHand.length === 0 || latestRoomState.jogadores[aiId]?.hasPlayed) { 
        console.log(`IA ${aiId}: Mão vazia ou já jogou, não pode jogar.`);
        return;
    }

    let currentAiHand = [...aiHand];
    let whiteDeck = [...latestRoomState.whiteCardDeck]; 

    while (currentAiHand.length < 7 && whiteDeck.length > 0) {
        const newCardId = whiteDeck.shift();
        currentAiHand.push(newCardId);
    }

    const cardsToPlay = [];
    let tempHand = [...currentAiHand]; 

    for (let i = 0; i < blackCardPick; i++) {
        if (tempHand.length > 0) {
            const randomIndex = Math.floor(Math.random() * tempHand.length);
            cardsToPlay.push(tempHand.splice(randomIndex, 1)[0]); 
        } else {
            console.warn(`IA ${aiId}: Não há cartas suficientes para jogar. Jogando o que tem.`);
            break;
        }
    }

    const newAiHand = currentAiHand.filter(cardId => !cardsToPlay.includes(cardId));

    await updateDoc(roomRef, {
        [`jogadores.${aiId}.hand`]: newAiHand,
        [`jogadores.${aiId}.hasPlayed`]: true,
        [`playedWhiteCards.${aiId}`]: cardsToPlay,
        whiteCardDeck: whiteDeck 
    });
    console.log(`IA ${aiId} jogou ${cardsToPlay.length} cartas.`);
    checkAllPlayersPlayedForVoting();
}

async function aiCastVote(aiId, playedCards) {
    console.log(`IA ${aiId} votando...`);
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) return;
    const latestRoomState = roomDoc.data();
    if (latestRoomState.votes[aiId]) { 
        console.log(`IA ${aiId}: Já votou.`);
        return;
    }

    const playerIdsWhoPlayed = Object.keys(playedCards);
    const eligiblePlayersForVote = playerIdsWhoPlayed.filter(id => id !== aiId); 

    if (eligiblePlayersForVote.length === 0) {
        console.log(`IA ${aiId}: Nenhuma carta válida para votar.`);
        if(playerIdsWhoPlayed.length > 0 && playerIdsWhoPlayed[0] === aiId) {
            await castVote(aiId, aiId); 
        }
        return;
    }

    const randomPlayerToVote = eligiblePlayersForVote[Math.floor(Math.random() * eligiblePlayersForVote.length)];
    
    await castVote(aiId, randomPlayerToVote); 
    console.log(`IA ${aiId} votou em ${latestRoomState.jogadores[randomPlayerToVote]?.name}.`); 
    checkAllVotesReceived();
}

// 3. Funções para gerenciar salas
async function createRoom() {
    if (!db || !userId || !userName) {
        showMessage(errorMessageDiv, 'Erro: Dados do usuário ou Firebase não prontos.', true);
        return;
    }

    createRoomButton.disabled = true;
    hideMessage(errorMessageDiv);
    hideMessage(infoMessageDiv);

    try {
        const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoomId);

        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists()) {
            showModal('Erro', 'Tente novamente. O ID da sala já existe (colisão).');
            return;
        }

        const initialRoomData = {
            id: newRoomId,
            hostId: userId,
            status: 'aguardando_jogadores',
            jogadores: {
                [userId]: { name: userName, score: 0, connected: true, hand: [], hasPlayed: false, hasVoted: false },
            },
            currentBlackCard: null,
            playedWhiteCards: {}, 
            votes: {}, 
            roundWinnerId: null,
            round: 0,
            whiteCardDeck: [],
            blackCardDeck: [],
            esperandoCartas: {},
            hasAI: enableAiCheckbox.checked 
        };

        if (enableAiCheckbox.checked) {
            initialRoomData.jogadores[aiPlayerId] = { name: 'Robô IA', score: 0, connected: true, hand: [], hasPlayed: false, hasVoted: false };
        }


        await setDoc(roomRef, initialRoomData);
        roomId = newRoomId;
        showMessage(infoMessageDiv, `Sala ${newRoomId} criada! Compartilhe o ID.`);
        showModal('Sala Criada!', `Sua sala foi criada com o ID: ${newRoomId}. Compartilhe com seus amigos!`);
        setupRoomListener(); 
        updateUI();
    }
    catch (error) {
        console.error("Erro ao criar sala:", error);
        showMessage(errorMessageDiv, `Erro ao criar sala: ${error.message}`, true);
    } finally {
        if (!modalOverlay.classList.contains('hidden')) { 
            createRoomButton.disabled = true; 
        } else {
            createRoomButton.disabled = false;
        }
    }
}

async function joinRoom() {
    const inputId = roomInput.value.toUpperCase();
    if (!db || !userId || !userName || !inputId) {
        showMessage(errorMessageDiv, 'Por favor, insira um ID de sala.', true);
        return;
    }

    joinRoomButton.disabled = true;
    hideMessage(errorMessageDiv);
    hideMessage(infoMessageDiv);

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', inputId);
        const roomDoc = await getDoc(roomRef);

        if (!roomDoc.exists()) {
            showModal('Erro', 'Sala não encontrada. Verifique o ID.');
            return;
        }

        const roomData = roomDoc.data();
        if (roomData.status !== 'aguardando_jogadores' && roomData.status !== 'em_jogo') {
            showModal('Erro', 'Esta sala não está aceitando novos jogadores agora.');
            return;
        }

        if (!roomData.jogadores[userId]) {
            await updateDoc(roomRef, {
                [`jogadores.${userId}`]: { name: userName, score: 0, connected: true, hand: [], hasPlayed: false, hasVoted: false }
            });
        } else {
            await updateDoc(roomRef, {
                [`jogadores.${userId}.connected`]: true,
                [`jogadores.${userId}.name`]: userName 
            });
        }


        roomId = inputId;
        showMessage(infoMessageDiv, `Você entrou na sala ${inputId}.`);
        setupRoomListener(); 
        updateUI();
    } catch (error) {
        console.error("Erro ao entrar na sala:", error);
        showMessage(errorMessageDiv, `Erro ao entrar na sala: ${error.message}`, true);
    } finally {
        if (!modalOverlay.classList.contains('hidden')) { 
            joinRoomButton.disabled = true; 
        } else {
            joinRoomButton.disabled = false;
        }
    }
}

async function leaveRoom() {
    if (!db || !userId || !roomId) return;

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);

        if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            const updatedPlayers = { ...roomData.jogadores };
            if (updatedPlayers[userId]) {
                updatedPlayers[userId].connected = false;
            }
            await updateDoc(roomRef, { jogadores: updatedPlayers });

            if (roomData.hostId === userId) {
                showModal('Saindo da Sala', 'Você é o criador da sala. Considere encerrar a sala para outros jogadores.');
            }
        }
        roomId = '';
        currentRoom = null;
        selectedWhiteCards = [];
        if (unsubscribeRoomSnapshot) {
            unsubscribeRoomSnapshot(); 
        }
        updateUI();
    } catch (error) {
        console.error("Erro ao sair da sala:", error);
        showMessage(errorMessageDiv, `Erro ao sair da sala: ${error.message}`, true);
    }
}

async function deleteRoom() {
    if (!db || !roomId || !currentRoom || currentRoom.hostId !== userId) return;

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        await deleteDoc(roomRef);
        roomId = '';
        currentRoom = null;
        selectedWhiteCards = [];
        if (unsubscribeRoomSnapshot) {
            unsubscribeRoomSnapshot(); 
        }
        showModal('Sala Encerrada', 'A sala foi encerrada com sucesso.');
        updateUI();
    } catch (error) {
        console.error("Erro ao deletar sala:", error);
        showMessage(errorMessageDiv, `Erro ao deletar sala: ${error.message}`, true);
    }
}

// 4. Lógica do Jogo

async function distributeInitialCards() {
    if (!db || !userId || !roomId || !currentRoom || currentRoom.status !== 'aguardando_jogadores' || currentRoom.hostId !== userId) return;

    hideMessage(errorMessageDiv);
    showMessage(infoMessageDiv, 'Distribuindo cartas...');

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

        let blackDeck = shuffleArray([...exampleBlackCards]);
        let whiteDeck = shuffleArray([...exampleWhiteCards]);

        const connectedPlayers = Object.keys(currentRoom.jogadores).filter(pid => currentRoom.jogadores[pid].connected);
        if (connectedPlayers.length < 1) { 
            showModal('Erro', 'Pelo menos 1 jogador (você) é necessário para iniciar o jogo.');
            return;
        }
        const firstBlackCard = blackDeck.shift();

        const updatedPlayers = { ...currentRoom.jogadores };
        const esperandoCartas = {};

        for (const playerId of connectedPlayers) {
            const player = updatedPlayers[playerId];
            const newHand = [];
            for (let i = 0; i < 7; i++) {
                if (whiteDeck.length > 0) {
                    newHand.push(whiteDeck.pop().id);
                }
            }
            player.hand = newHand;
            player.hasPlayed = false;
            player.hasVoted = false; 
            esperandoCartas[playerId] = false;
        }

        await updateDoc(roomRef, {
            blackCardDeck: blackDeck.map(card => card.id),
            whiteCardDeck: whiteDeck.map(card => card.id),
            jogadores: updatedPlayers,
            currentBlackCard: firstBlackCard,
            status: 'em_jogo',
            round: 1,
            playedWhiteCards: {},
            votes: {}, 
            roundWinnerId: null,
            esperandoCartas: esperandoCartas,
        });
        showMessage(infoMessageDiv, 'Jogo iniciado! Boa sorte!');
        console.log("distributeInitialCards: Jogo iniciado e status atualizado."); 
    } catch (error) {
        console.error("Erro ao iniciar jogo:", error);
        showMessage(errorMessageDiv, `Erro ao iniciar jogo: ${error.message}`, true);
    }
}

async function dealWhiteCards(playerIdToDeal = userId) { 
    if (!db || !roomId || !currentRoom) return; 

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) return;
    const latestRoomState = roomDoc.data();
    const playerToDealData = latestRoomState.jogadores[playerIdToDeal];


    if (!playerToDealData || playerToDealData.hand.length >= 7 || latestRoomState.esperandoCartas[playerIdToDeal]) { 
        return;
    }

    try {
        await updateDoc(roomRef, {
            [`esperandoCartas.${playerIdToDeal}`]: true
        });

        const freshRoomDoc = await getDoc(roomRef);
        const freshRoomData = freshRoomDoc.data();
        let whiteDeck = freshRoomData.whiteCardDeck || [];
        let playerHand = freshRoomData.jogadores[playerIdToDeal]?.hand || [];
        let cardsAdded = 0;

        while (playerHand.length < 7 && whiteDeck.length > 0) {
            const newCardId = whiteDeck.shift();
            playerHand.push(newCardId);
            cardsAdded++;
        }

        await updateDoc(roomRef, {
            whiteDeck: whiteDeck,
            [`jogadores.${playerIdToDeal}.hand`]: playerHand,
            [`esperandoCartas.${playerIdToDeal}`]: false
        });

        if (cardsAdded > 0 && playerIdToDeal === userId) { 
            showMessage(infoMessageDiv, `Você puxou ${cardsAdded} cartas.`);
        } else if (cardsAdded === 0 && playerIdToDeal === userId) {
            showMessage(infoMessageDiv, 'Seu baralho de cartas brancas acabou!');
        }
        console.log(`dealWhiteCards: Jogador ${playerIdToDeal} puxou ${cardsAdded} cartas. Mão atual:`, playerHand.length); 
    } catch (error) {
        console.error("Erro ao puxar cartas brancas:", error);
        showMessage(errorMessageDiv, `Erro ao puxar cartas: ${error.message}`, true);
        await updateDoc(roomRef, {
            [`esperandoCartas.${playerIdToDeal}`]: false
        });
    }
}


function selectWhiteCard(cardId) {
    if (currentRoom?.jogadores[userId]?.hasPlayed) { 
        showModal('Ação Inválida', 'Você já jogou nesta rodada.');
        return;
    }
    if (selectedWhiteCards.includes(cardId)) {
        selectedWhiteCards = selectedWhiteCards.filter(id => id !== cardId);
    } else {
        const blackCardPick = currentRoom?.currentBlackCard?.pick || 1;
        if (selectedWhiteCards.length < blackCardPick) {
            selectedWhiteCards.push(cardId);
        } else {
            showModal('Limite Atingido', `Você pode selecionar apenas ${blackCardPick} carta(s).`);
        }
    }
    updatePlayerHandUI(); 
}

async function playSelectedCards() {
    if (!db || !userId || !roomId || !currentRoom) return;
    if (currentRoom.jogadores[userId]?.hasPlayed) { 
        showModal('Ação Inválida', 'Você já jogou nesta rodada.');
        return;
    }
    const blackCardPick = currentRoom?.currentBlackCard?.pick || 1;
    if (selectedWhiteCards.length !== blackCardPick) {
        showModal('Erro', `Por favor, selecione ${blackCardPick} carta(s) para jogar.`);
        return;
    }

    hideMessage(errorMessageDiv);
    showMessage(infoMessageDiv, 'Jogando suas cartas...');

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        const playerHandBeforePlay = currentRoom.jogadores[userId]?.hand || [];

        const newPlayerHand = playerHandBeforePlay.filter(cardId => !selectedWhiteCards.includes(cardId));

        await updateDoc(roomRef, {
            [`jogadores.${userId}.hand`]: newPlayerHand,
            [`jogadores.${userId}.hasPlayed`]: true,
            [`playedWhiteCards.${userId}`]: selectedWhiteCards,
        });
        selectedWhiteCards = [];
        showMessage(infoMessageDiv, 'Cartas jogadas! Aguardando outros jogadores...');

        checkAllPlayersPlayedForVoting();
        console.log("playSelectedCards: Jogador jogou e chamou checkAllPlayersPlayedForVoting."); 

    } catch (error) {
        console.error("Erro ao jogar cartas:", error);
        showMessage(errorMessageDiv, `Erro ao jogar cartas: ${error.message}`, true);
    }
}

async function castVote(voterId, votedPlayerId) {
    if (!db || !roomId || !currentRoom) return;
    if (currentRoom.status !== 'voting') {
        console.warn(`Tentativa de votar fora da fase de votação pelo jogador ${voterId}`);
        return;
    }
    if (currentRoom.jogadores[voterId]?.hasVoted) { 
        console.warn(`Jogador ${voterId} já votou.`);
        return;
    }

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    try {
        await updateDoc(roomRef, {
            [`votes.${voterId}`]: votedPlayerId, 
            [`jogadores.${voterId}.hasVoted`]: true 
        });
        if (voterId === userId) { 
            showMessage(infoMessageDiv, 'Seu voto foi registrado! Aguardando os outros votos.');
        }
        checkAllVotesReceived();
        console.log(`castVote: Jogador ${voterId} votou e chamou checkAllVotesReceived.`); 

    } catch (error) {
        console.error("Erro ao votar:", error);
        if (voterId === userId) {
            showMessage(errorMessageDiv, `Erro ao registrar voto: ${error.message}`, true);
        }
    }
}

async function checkAllPlayersPlayedForVoting() {
    if (!currentRoom || currentRoom.status !== 'em_jogo') {
        console.log("checkAllPlayersPlayedForVoting: Condição de status não atendida ou currentRoom null."); 
        return;
    }

    const activePlayers = Object.keys(currentRoom.jogadores).filter(pid => currentRoom.jogadores[pid].connected);
    const playersWhoNeedToPlay = activePlayers.filter(pid => !currentRoom.jogadores[pid].hasPlayed);
    
    console.log("checkAllPlayersPlayedForVoting: Jogadores que precisam jogar:", playersWhoNeedToPlay.length); 

    if (playersWhoNeedToPlay.length === 0) {
        console.log('checkAllPlayersPlayedForVoting: Todos os jogadores jogaram. Transicionando para fase de votação...');
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        await updateDoc(roomRef, { status: 'voting' });
    }
}

async function checkAllVotesReceived() {
    if (!currentRoom || currentRoom.status !== 'voting') {
        console.log("checkAllVotesReceived: Condição de status não atendida ou currentRoom null."); 
        return;
    }

    const playersWhoCanVote = Object.keys(currentRoom.jogadores).filter(pid =>
        currentRoom.jogadores[pid].connected && pid !== userId 
    );
    
    const votesReceivedCount = Object.keys(currentRoom.votes || {}).length;
    console.log(`checkAllVotesReceived: Votos recebidos: ${votesReceivedCount} de ${playersWhoCanVote.length} votantes.`); 

    if (votesReceivedCount === playersWhoCanVote.length && playersWhoCanVote.length > 0) {
        console.log('checkAllVotesReceived: Todos os votos recebidos. Contando votos...');
        await tallyVotes();
    } else if (playersWhoCanVote.length === 0 && currentRoom.hasAI && currentRoom.jogadores[aiPlayerId]) {
         console.log('checkAllVotesReceived: IA única na sala, votou. Contando votos...');
         await tallyVotes(); 
    }
}


async function tallyVotes() {
    if (!db || !roomId || !currentRoom) {
        console.error("tallyVotes: DB, RoomId ou CurrentRoom não estão prontos."); 
        return;
    }

    if (currentRoom.status !== 'voting') {
        console.warn("tallyVotes: Tentativa de contar votos fora da fase de votação.");
        return;
    }

    console.log("tallyVotes: Contando votos...");

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const votes = currentRoom.votes || {}; 
    const voteCounts = {}; 

    for (const voterId in votes) {
        const votedPlayerId = votes[voterId];
        if (votedPlayerId && currentRoom.jogadores[votedPlayerId]) { 
            voteCounts[votedPlayerId] = (voteCounts[votedPlayerId] || 0) + 1;
        }
    }

    let winningPlayerId = null;
    let maxVotes = -1;
    let tiedWinners = []; 

    for (const playerId in voteCounts) {
        if (voteCounts[playerId] > maxVotes) {
            maxVotes = voteCounts[playerId];
            winningPlayerId = playerId;
            tiedWinners = [playerId]; 
        } else if (voteCounts[playerId] === maxVotes) {
            tiedWinners.push(playerId); 
        }
    }

    if (tiedWinners.length > 1) {
        winningPlayerId = tiedWinners[Math.floor(Math.random() * tiedWinners.length)];
        console.log(`tallyVotes: Empate! Vencedor aleatório escolhido: ${currentRoom.jogadores[winningPlayerId]?.name}`);
    } else if (tiedWinners.length === 1) {
        winningPlayerId = tiedWinners[0];
    } else {
        winningPlayerId = null;
    }

    const playersWhoPlayedCards = Object.keys(currentRoom.playedWhiteCards || {});
    if (!winningPlayerId && playersWhoPlayedCards.length > 0) {
         if (playersWhoPlayedCards.length === 1 && currentRoom.jogadores[playersWhoPlayedCards[0]]) {
             winningPlayerId = playersWhoPlayedCards[0];
             console.log(`tallyVotes: Apenas um jogador (${currentRoom.jogadores[winningPlayerId].name}) jogou. Ele vence por padrão.`);
         } else {
             winningPlayerId = null;
             console.log("tallyVotes: Múltiplas cartas jogadas, mas nenhum voto válido para um vencedor.");
         }
    }

    const winnerCurrentScore = winningPlayerId ? (currentRoom.jogadores[winningPlayerId]?.score || 0) : 0;

    await updateDoc(roomRef, {
        [`jogadores.${winningPlayerId}.score`]: winnerCurrentScore + 1, 
        roundWinnerId: winningPlayerId,
        status: 'fim_de_rodada'
    });
    showMessage(infoMessageDiv, `Votos contados! ${currentRoom.jogadores[winningPlayerId]?.name || 'Ninguém'} venceu esta rodada!`);
    console.log("tallyVotes: Votação concluída e status atualizado para 'fim_de_rodada'."); 
}


async function startNextRound() {
    if (!db || !userId || !roomId || !currentRoom || currentRoom.hostId !== userId) return;

    hideMessage(errorMessageDiv);
    showMessage(infoMessageDiv, 'Iniciando próxima rodada...');

    try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        const roomDoc = await getDoc(roomRef); 
        if (!roomDoc.exists()) {
            console.error("startNextRound: Sala não existe ao tentar iniciar nova rodada.");
            return;
        }
        const latestRoomState = roomDoc.data();


        let blackDeck = latestRoomState.blackCardDeck || [];
        let whiteDeck = latestRoomState.whiteCardDeck || [];

        Object.values(latestRoomState.playedWhiteCards || {}).flat().forEach(cardId => {
            whiteDeck.push(cardId);
        });
        whiteDeck = shuffleArray(whiteDeck);

        if (blackDeck.length === 0) {
            blackDeck = shuffleArray(exampleBlackCards.map(c => c.id));
            showModal('Aviso', 'Baralho de cartas pretas esgotado. Reiniciando baralho!');
        }
        const nextBlackCardId = blackDeck.shift();
        const nextBlackCard = exampleBlackCards.find(c => c.id === nextBlackCardId);

        if (!nextBlackCard) {
            showModal('Erro', 'Não foi possível encontrar a próxima carta preta. O jogo pode ter problemas.');
            return;
        }

        const updatedPlayers = {};
        const newEsperandoCartasState = {}; 

        for (const playerId of Object.keys(latestRoomState.jogadores)) {
            const player = { ...latestRoomState.jogadores[playerId] }; 
            
            player.hasPlayed = false; 
            player.hasVoted = false; 
            newEsperandoCartasState[playerId] = false; 

            if (player.connected) {
                 let playerHand = player.hand || [];
                 while (playerHand.length < 7 && whiteDeck.length > 0) {
                     const newCardId = whiteDeck.shift();
                     playerHand.push(newCardId);
                 }
                 player.hand = playerHand;
            }
            updatedPlayers[playerId] = player;
        }
        console.log("startNextRound: Player states after reset (before updateDoc):", JSON.stringify(updatedPlayers, null, 2));


        await updateDoc(roomRef, {
            blackCardDeck: blackDeck,
            whiteCardDeck: whiteDeck,
            currentBlackCard: nextBlackCard,
            status: 'em_jogo',
            round: latestRoomState.round + 1,
            playedWhiteCards: {},
            votes: {}, 
            roundWinnerId: null,
            jogadores: updatedPlayers, 
            esperandoCartas: newEsperandoCartasState, 
        });
        showMessage(infoMessageDiv, 'Rodada ' + (latestRoomState.round + 1) + ' iniciada!');
        console.log("startNextRound: Nova rodada iniciada. updateDoc completado."); 
    } catch (error) {
        console.error("Erro ao iniciar próxima rodada:", error);
        showMessage(errorMessageDiv, `Erro ao iniciar próxima rodada: ${error.message}`, true);
    }
}

// Mapeia IDs de cartas para objetos de cartas (para exibir)
function getCardById(id, type) {
    if (type === 'black') {
        return exampleBlackCards.find(card => card.id === id);
    } else if (type === 'white') {
        return exampleWhiteCards.find(card => card.id === id);
    }
    return null;
}

// --- Funções de Atualização da UI ---
function updateUI() {
    userIdDisplay.textContent = userId || 'N/A';
    userNameDisplay.textContent = userName || 'N/A';
    userNameInput.value = userName;
    console.log('updateUI chamado. Current Room Status:', currentRoom ? currentRoom.status : 'N/A'); 
    if (currentRoom && currentRoom.jogadores[userId]) {
        console.log(`Player ${userId} - hasPlayed: ${currentRoom.jogadores[userId].hasPlayed}, hasVoted: ${currentRoom.jogadores[userId].hasVoted}`);
    }


    if (!roomId) {
        authSection.classList.remove('hidden');
        gameSection.classList.add('hidden');
        hideMessage(errorMessageDiv);
        hideMessage(infoMessageDiv);

        if (isAuthReady && userName) {
            createRoomButton.disabled = false;
            joinRoomButton.disabled = false;
        } else {
            createRoomButton.disabled = true;
            joinRoomButton.disabled = true;
        }

    } else {
        authSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        roomIdDisplay.textContent = `Sala: ${roomId}`;
        updatePlayersListUI();
        updateGameStatusUI();
    }

    if (currentRoom && currentRoom.hostId === userId) {
        deleteRoomButton.classList.remove('hidden');
    } else {
        deleteRoomButton.classList.add('hidden');
    }
}

function updatePlayersListUI() {
    playersList.innerHTML = '';
    if (currentRoom && currentRoom.jogadores) {
        Object.keys(currentRoom.jogadores).forEach((playerId) => { 
            const player = currentRoom.jogadores[playerId];
            const isConnected = player.connected;
            const isMe = userId === playerId;
            const isAI = playerId === aiPlayerId;
            const hasPlayed = player.hasPlayed;
            const hasVoted = player.hasVoted;

            const playerSpan = document.createElement('span');
            let playerClass = `px-3 py-1 rounded-full text-sm font-semibold ${isConnected ? 'player-status-tag connected' : 'player-status-tag disconnected'} ${isMe ? 'ring-2 ring-white' : ''} ${isAI ? 'player-status-tag ai' : ''}`;
            if (currentRoom.status === 'em_jogo') {
                playerClass += ` ${hasPlayed ? 'player-status-tag played' : ''}`; 
            } else if (currentRoom.status === 'voting') {
                 playerClass += ` ${hasVoted ? 'player-status-tag voted' : ''}`; 
            }


            playerSpan.className = playerClass;
            playerSpan.textContent = `${player.name} (${player.score}) ${isMe ? '(Você)' : ''} ${isAI ? '(IA)' : ''}`;
            playersList.appendChild(playerSpan);
        });
    }
}

function updateGameStatusUI() {
    if (!currentRoom) return;
    console.log("updateGameStatusUI: Status atual:", currentRoom.status); 

    inGameArea.classList.add('hidden');
    endRoundArea.classList.add('hidden');
    startGameButton.classList.add('hidden');
    waitingHostMessage.classList.add('hidden');
    nextRoundButton.classList.add('hidden');
    nextRoundWaitingMessage.classList.add('hidden');
    playCardsButton.classList.add('hidden');
    hasPlayedMessage.classList.add('hidden');
    hasVotedMessage.classList.add('hidden');
    reviewStatusMessage.textContent = '';
    playedCardsTitle.textContent = '';
    votingWaitingMessage.textContent = '';
    playerHandTitle.textContent = '';
    playedCardsReviewArea.classList.add('hidden');
    timerDisplay.classList.add('hidden'); 

    if (currentRoom.status === 'aguardando_jogadores') {
        if (currentRoom.hostId === userId) {
            startGameButton.classList.remove('hidden');
            console.log("updateGameStatusUI: Botão 'Iniciar Jogo' visível."); 
        } else {
            waitingHostMessage.classList.remove('hidden');
            console.log("updateGameStatusUI: Mensagem 'Aguardando Host' visível."); 
        }
    } else if (currentRoom.status === 'em_jogo') {
        inGameArea.classList.remove('hidden');
        currentBlackCardDiv.textContent = `${currentRoom.currentBlackCard.text} (${currentRoom.currentBlackCard.pick} escolha${currentRoom.currentBlackCard.pick > 1 ? 's' : ''})`;

        playedCardsReviewArea.classList.remove('hidden');
        reviewStatusMessage.textContent = 'Joguem suas cartas!';
        playedCardsTitle.textContent = 'Cartas Jogadas (Aguardando todos):';
        updateCzarPlayedCardsDisplay(); 

        const playersWhoNeedToPlay = Object.keys(currentRoom.jogadores)
            .filter(playerId => !currentRoom.jogadores[playerId].hasPlayed && currentRoom.jogadores[playerId].connected);
        
        if (playersWhoNeedToPlay.length > 0) {
            votingWaitingMessage.textContent = `Aguardando ${playersWhoNeedToPlay.length} jogador(es) jogar(em) suas cartas...`;
            votingWaitingMessage.classList.remove('hidden');
        } else {
            votingWaitingMessage.classList.add('hidden');
        }

        playerHandView.classList.remove('hidden');
        playerHandTitle.textContent = 'Sua Mão:';
        updatePlayerHandUI(); 
        if (currentRoom.jogadores[userId]?.hasPlayed) {
            hasPlayedMessage.classList.remove('hidden');
        } else {
            playCardsButton.classList.remove('hidden');
        }
    } else if (currentRoom.status === 'voting') {
        inGameArea.classList.remove('hidden');
        currentBlackCardDiv.textContent = `${currentRoom.currentBlackCard.text} (${currentRoom.currentBlackCard.pick} escolha${currentRoom.currentBlackCard.pick > 1 ? 's' : ''})`;

        playedCardsReviewArea.classList.remove('hidden');
        reviewStatusMessage.textContent = 'Vote na melhor resposta!';
        playedCardsTitle.textContent = 'Cartas para Votação:';
        updateVotingCardsDisplay(); 

        playerHandView.classList.remove('hidden'); 
        playerHandTitle.textContent = 'Sua Mão (para referência):'; 
        updatePlayerHandUI(); 

        if (currentRoom.jogadores[userId]?.hasVoted) {
            hasVotedMessage.classList.remove('hidden');
        } else {
        }

        const playersWhoCanVote = Object.keys(currentRoom.jogadores).filter(playerId => currentRoom.jogadores[playerId].connected);
        const votesReceivedCount = Object.keys(currentRoom.votes || {}).length;

        votingWaitingMessage.textContent = `Aguardando votos: ${votesReceivedCount}/${playersWhoCanVote.length} recebidos...`;
        votingWaitingMessage.classList.remove('hidden');
        timerDisplay.classList.remove('hidden'); 

    }
    else if (currentRoom.status === 'fim_de_rodada') {
        endRoundArea.classList.remove('hidden');
        roundWinnerDisplay.textContent = currentRoom.roundWinnerId && currentRoom.jogadores[currentRoom.roundWinnerId] ?
            `Vencedor: ${currentRoom.jogadores[currentRoom.roundWinnerId].name}!` : 'Nenhum vencedor selecionado.';

        endRoundBlackCard.textContent = currentRoom.currentBlackCard?.text || 'N/A';

        endRoundWinningCard.innerHTML = '';
        if (currentRoom.roundWinnerId && currentRoom.playedWhiteCards[currentRoom.roundWinnerId]) {
            currentRoom.playedWhiteCards[currentRoom.roundWinnerId].forEach(cardId => {
                const card = getCardById(cardId, 'white');
                const p = document.createElement('p');
                p.className = 'text-white text-md mb-1 last:mb-0';
                p.textContent = card ? card.text : 'Carta Desconhecida';
                endRoundWinningCard.appendChild(p);
            });
        } else {
            endRoundWinningCard.textContent = 'N/A';
        }


        if (currentRoom.hostId === userId) {
            nextRoundButton.classList.remove('hidden');
        } else {
            nextRoundWaitingMessage.classList.remove('hidden');
        }
    }
}

function updateCzarPlayedCardsDisplay() { 
    playedWhiteCardsGrid.innerHTML = '';
    const playerIdsWhoPlayed = Object.keys(currentRoom.playedWhiteCards);

    if (playerIdsWhoPlayed.length === 0) {
        noCardsPlayedMessage.classList.remove('hidden');
        return;
    } else {
        noCardsPlayedMessage.classList.add('hidden');
    }

    const shuffledPlayedCardsEntries = shuffleArray(Object.entries(currentRoom.playedWhiteCards)); 

    shuffledPlayedCardsEntries.forEach(([playerId, cardIds]) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'bg-gray-700 p-4 rounded-lg shadow-md border-2 border-transparent';

        cardIds.forEach((cardId, i) => {
            const card = getCardById(cardId, 'white');
            const p = document.createElement('p');
            p.className = 'text-white text-md mb-1 last:mb-0';
            p.textContent = card ? card.text : 'Carta Desconhecida';
            cardContainer.appendChild(p);
        });
        playedWhiteCardsGrid.appendChild(cardContainer);
    });
}

function updateVotingCardsDisplay() {
    playedWhiteCardsGrid.innerHTML = '';
    const playerIdsWhoPlayed = Object.keys(currentRoom.playedWhiteCards);

    if (playerIdsWhoPlayed.length === 0) {
        noCardsPlayedMessage.textContent = 'Nenhuma carta jogada para votar.';
        noCardsPlayedMessage.classList.remove('hidden');
        return;
    } else {
        noCardsPlayedMessage.classList.add('hidden');
    }

    const shuffledPlayedCardsEntries = shuffleArray(Object.entries(currentRoom.playedWhiteCards));

    shuffledPlayedCardsEntries.forEach(([playerId, cardIds]) => {
        const cardContainer = document.createElement('div');
        let cardClass = 'bg-gray-700 p-4 rounded-lg shadow-md border-2 ';

        const hasVoted = currentRoom.votes[userId] === playerId; 
        const canVote = !currentRoom.jogadores[userId]?.hasVoted; 
        const isMyOwnCard = userId === playerId; 

        if (canVote && !isMyOwnCard) { 
            cardClass += 'border-transparent hover:border-blue-500 cursor-pointer transition duration-200 ease-in-out transform hover:scale-105';
            cardContainer.addEventListener('click', () => castVote(userId, playerId));
        } else if (hasVoted) {
            cardClass += 'border-blue-500 ring-2 ring-blue-300'; 
        } else if (isMyOwnCard && !canVote) { 
            cardClass += 'border-yellow-300'; 
        } else {
            cardClass += 'border-gray-500'; 
        }
        
        cardContainer.className = cardClass;

        cardIds.forEach((cardId, i) => {
            const card = getCardById(cardId, 'white');
            const p = document.createElement('p');
            p.className = 'text-white text-md mb-1 last:mb-0';
            p.textContent = card ? card.text : 'Carta Desconhecida';
            cardContainer.appendChild(p);
        });

        if (canVote && !isMyOwnCard) {
            const instructionP = document.createElement('p');
            instructionP.className = 'text-gray-400 text-sm mt-2';
            instructionP.textContent = '(Clique para votar)';
            cardContainer.appendChild(instructionP);
        } else if (hasVoted) {
             const votedMessage = document.createElement('p');
             votedMessage.className = 'text-blue-300 text-sm mt-2 font-bold';
             votedMessage.textContent = 'Seu voto!';
             cardContainer.appendChild(votedMessage);
        } else if (isMyOwnCard) {
             const ownCardMessage = document.createElement('p');
             ownCardMessage.className = 'text-yellow-300 text-sm mt-2 font-bold';
             ownCardMessage.textContent = 'Sua carta!';
             cardContainer.appendChild(ownCardMessage);
        }
        playedWhiteCardsGrid.appendChild(cardContainer);
    });
}

function updatePlayerHandUI() {
    playerHandGrid.innerHTML = '';
    const playerHand = currentRoom?.jogadores[userId]?.hand || [];

    playerHand.forEach(cardId => {
        const card = getCardById(cardId, 'white');
        const isSelected = selectedWhiteCards.includes(cardId);

        const cardDiv = document.createElement('div');
        cardDiv.className = `card-white ${isSelected ? 'selected' : ''}`;
        cardDiv.textContent = card ? card.text : 'Carta Desconhecida';
        cardDiv.dataset.cardId = cardId; 
        if (currentRoom.status === 'em_jogo' && !currentRoom.jogadores[userId]?.hasPlayed) {
            cardDiv.addEventListener('click', () => selectWhiteCard(cardId));
        } else {
            cardDiv.style.cursor = 'default'; 
        }
        playerHandGrid.appendChild(cardDiv);
    });

    if (currentRoom.status === 'em_jogo' && !currentRoom.jogadores[userId]?.hasPlayed) {
        playCardsButton.classList.remove('hidden');
        hasPlayedMessage.classList.add('hidden');
        hasVotedMessage.classList.add('hidden'); 
        if (selectedWhiteCards.length !== (currentRoom?.currentBlackCard?.pick || 1)) {
            playCardsButton.disabled = true;
        } else {
            playCardsButton.disabled = false;
        }
    } else {
        playCardsButton.classList.add('hidden');
        if (currentRoom.jogadores[userId]?.hasPlayed) {
            if (currentRoom.status === 'voting' && currentRoom.jogadores[userId]?.hasVoted) {
                hasVotedMessage.classList.remove('hidden');
                hasPlayedMessage.classList.add('hidden');
            } else if (currentRoom.jogadores[userId]?.hasPlayed) {
                 hasPlayedMessage.classList.remove('hidden');
                 hasVotedMessage.classList.add('hidden');
            }
        }
    }
}

// Event Listeners
window.onload = async () => {
    await loadCards(); // Carrega as cartas primeiro
    initFirebase();
};
userNameInput.addEventListener('input', (e) => {
    userName = e.target.value;
    if (userId) {
        localStorage.setItem(`userName_${userId}`, userName);
    }
    updateUI(); 
});
createRoomButton.addEventListener('click', createRoom);
joinRoomButton.addEventListener('click', joinRoom);
leaveRoomButton.addEventListener('click', leaveRoom);
deleteRoomButton.addEventListener('click', deleteRoom);
startGameButton.addEventListener('click', distributeInitialCards);
playCardsButton.addEventListener('click', playSelectedCards);
nextRoundButton.addEventListener('click', startNextRound);