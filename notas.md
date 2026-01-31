#room_message_sender_info es el 

sendChatMessage("asdasd", {"sender_info": "Character-1910159"})



$('action-bar-button').data("element") =

{
    "id": 1569990,
    "name": "Enmarañar",
    "text": "",
    "icon": "https://s3-eu-west-2.amazonaws.com/dungeon20/images/142/medium-877060605a805288589676038fd35ba15bd9a6d1.png?1637056760",
    "description": "<p>Lanzar Enmarañar\nhola</p>\n",
    "action_type": "none",
    "hidden": false,
    "order": null,
    "source_name": "Eiron",
    "tooltip_title": "Enmarañar",
    "owned": false
}


$('action-bar-button').click(() => {
    const roomMessageSenderInfo = document.getElementById("room_message_sender_info").value;

    sendChatMessage("", {"action_id": 1569990, "sender_info": roomMessageSenderInfo})
})


// ejemplo de chat
room_message[room_id]
233565
room_message[sender_info]
Character-1910159
room_message[visibility]
public
room_message[data][roll][notation]
1d20+1
room_message[data][roll][split_notation]
d20+1
room_message[data][roll][set][]
d20
room_message[data][roll][rolls][0][notation]
1d20
room_message[data][roll][rolls][0][dice]
d20
room_message[data][roll][rolls][0][count]
1
room_message[data][roll][rolls][0][diceList][]
d20
room_message[data][roll][error]
false
room_message[data][results][]
20
room_message[data][roll_name]
Juego de Manos
room_message[data][roll_type]
check
room_message[message_type]
dice_roll
room_message[icon_url]
https://s3-eu-west-2.amazonaws.com/dungeon20/images/912/medium-0f861f410affbfcaa3c3997402a62fd0ae579146.PNG?1637060658
room_message[parent_icon_url]
/img/icons/skills.png


esta data va en js exactamente asi:

sendChatMessage("message text", {
    "data": {
        "roll": {
            "notation": "1d20+1",
            "split_notation": "d20+1",
            "set": ["d20"],
            "rolls": [
                {
                    "notation": "1d20",
                    "dice": "d20",
                    "count": 1,
                    "diceList": ["d20"]
                }
            ],
            "error": false,
        },
        "results": [20],
        "roll_name": "Juego de Manos",
        "roll_type": "check"
    }
})


// Todo esto tambien se replica con llamda a la api:

fetch("https://nivel20.com/room_messages", {
  "headers": {
    "accept": "*/*",
    "accept-language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7,es-419;q=0.6",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-csrf-token": "yU9WahrbIOni5oCtOV7Gp63uMLBFV5lS2lI+sOnKufzv6jR7nfXbye9kBwPM+yIA28wfcSdM6h6iWpawAvlNYQ==",
    "x-requested-with": "XMLHttpRequest"
  },
  "referrer": "https://nivel20.com/tabletop/U42NIX1T",
  "body": "room_message%5Broom_id%5D=233565&room_message%5Bsender_info%5D=Character-1910159&room_message%5Bvisibility%5D=public&room_message%5Bdata%5D%5Broll%5D%5Bnotation%5D=1d20%2B1&room_message%5Bdata%5D%5Broll%5D%5Bsplit_notation%5D=d20%2B1&room_message%5Bdata%5D%5Broll%5D%5Bset%5D%5B%5D=d20&room_message%5Bdata%5D%5Broll%5D%5Brolls%5D%5B0%5D%5Bnotation%5D=1d20&room_message%5Bdata%5D%5Broll%5D%5Brolls%5D%5B0%5D%5Bdice%5D=d20&room_message%5Bdata%5D%5Broll%5D%5Brolls%5D%5B0%5D%5Bcount%5D=1&room_message%5Bdata%5D%5Broll%5D%5Brolls%5D%5B0%5D%5BdiceList%5D%5B%5D=d20&room_message%5Bdata%5D%5Broll%5D%5Berror%5D=false&room_message%5Bdata%5D%5Bresults%5D%5B%5D=20&room_message%5Bdata%5D%5Broll_name%5D=Juego+de+Manos&room_message%5Bdata%5D%5Broll_type%5D=check&room_message%5Bmessage_type%5D=dice_roll&room_message%5Bicon_url%5D=https%3A%2F%2Fs3-eu-west-2.amazonaws.com%2Fdungeon20%2Fimages%2F912%2Fmedium-0f861f410affbfcaa3c3997402a62fd0ae579146.PNG%3F1637060658&room_message%5Bparent_icon_url%5D=%2Fimg%2Ficons%2Fskills.png",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});


Se pueden mandar requests con room_message[icon_url] para cambiar el icono del mensaje, por ejemplo el icon del action-bar-button element.

puedo meter logica custom en la ultima linea de la descripcion.




// Script para injectar nuevas features (jquery ya esta cargado)
```js
(() => {
    // Setup initial data
    const n21Data = {
        shiftPressed: false,
        altPressed: false,
    };
    window._n21_ = n21Data;

    /* ------ Funciones de utilidad ------ */
    // this function overrides a global function with a new function, this new hookFn return the new parameters for the original function
    function hookGlobalFn(fnName, hookFn) {
        const originalFn = window[fnName];
        window[fnName] = (...args) => {
            const newArgs = hookFn(...args);
            return originalFn(...newArgs);
        };
    }


    /* ------ Tiradas con ventaja o desventaja ------ */
    $(document).on('keydown', (e) => {
        if (e.key === "Shift") {
            n21Data.shiftPressed = true;
        }
        if (e.key === "Alt") {
            n21Data.altPressed = true;
        }
    });

    $(document).on('keyup', (e) => {
        if (e.key === "Shift") {
            n21Data.shiftPressed = false;
        }
        if (e.key === "Alt") {
            n21Data.altPressed = false;
        }
    });

    // Override diceRoll to add advantage/disadvantage
    hookGlobalFn('diceRoll', (notation, ...args) => {
        // if already has advantage/disadvantage, do nothing
        if(notation.toLowerCase().includes("max") || notation.toLowerCase().includes("min")) {
            return [notation, ...args];
        }

        if (n21Data.shiftPressed) {
            notation = `max(${notation}, ${notation})`;
        } else if (n21Data.altPressed) {
            notation = `min(${notation}, ${notation})`;
        }
        return [notation, ...args];
    }
   

})()
```