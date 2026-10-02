/* =========================================================
   ELEMENTS
========================================================= */

const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const chat = document.getElementById("chat");


/* =========================================================
   STATE
========================================================= */

let currentMenu = "main";
let waitingForScamMessage = false;


/* =========================================================
   FRAUD PREVENTION CONTENT
========================================================= */

const tips = {

    "1": {
        read: `
            <strong>🚨 Common Scam Warning Signs</strong>

            <br><br>

            Scammers often create pressure so you act
            before you have time to think.

            <br><br>

            Watch out for messages or calls that:

            <br><br>

            • Demand immediate action
            <br>
            • Ask for your OTP or PIN
            <br>
            • Ask for your password
            <br>
            • Promise unexpected money or prizes
            <br>
            • Threaten to suspend your account
            <br>
            • Ask you to send money
            <br>
            • Ask you to click an unfamiliar link

            <br><br>

            <strong>Remember:</strong>

            If something feels unusual, stop and verify
            it through an official Mukuru channel.
        `
    },

    "2": {
        read: `
            <strong>🔐 Protect Your Personal Information</strong>

            <br><br>

            Never share sensitive information with someone
            who contacts you unexpectedly.

            <br><br>

            Keep your:

            <br><br>

            • PIN
            <br>
            • OTP
            <br>
            • Password
            <br>
            • Card details
            <br>
            • Login details

            <br><br>

            private.

            <br><br>

            A legitimate organisation should not pressure
            you into revealing your security credentials.
        `
    },

    "3": {
        read: `
            <strong>🔗 Be Careful With Links</strong>

            <br><br>

            Scammers may send links that look like they
            belong to a trusted company.

            <br><br>

            Before clicking:

            <br><br>

            • Check the website address
            <br>
            • Be suspicious of strange domains
            <br>
            • Do not enter your password or PIN
            <br>
            • Do not download unexpected files
            <br>
            • Verify the message through an official channel

            <br><br>

            When in doubt, don't click.
        `
    },

    "4": {
        read: `
            <strong>📞 Fake Calls & Impersonation</strong>

            <br><br>

            A scammer may pretend to be a Mukuru employee
            or customer-service representative.

            <br><br>

            They may try to convince you that there is
            a problem with your account.

            <br><br>

            They may then ask for:

            <br><br>

            • Your OTP
            <br>
            • PIN
            <br>
            • Password
            <br>
            • Personal information
            <br>
            • Money

            <br><br>

            <strong>Do not share these details.</strong>

            <br><br>

            If you are unsure, end the call and contact
            Mukuru through an official channel.
        `
    },

    "5": {
        read: `
            <strong>💰 Payment Scams</strong>

            <br><br>

            Scammers may tell you that you need to make
            a payment before receiving money or completing
            a transaction.

            <br><br>

            Be careful if someone asks you to:

            <br><br>

            • Send money to release funds
            <br>
            • Pay a "verification fee"
            <br>
            • Deposit money into an unfamiliar account
            <br>
            • Transfer money urgently

            <br><br>

            Stop and verify the request before sending
            any money.
        `
    },

    "6": {
        read: `
            <strong>🏆 Prize & Giveaway Scams</strong>

            <br><br>

            You may receive a message saying that you
            have won money, a prize or a special reward.

            <br><br>

            The scammer may then ask you to:

            <br><br>

            • Pay a fee
            <br>
            • Click a link
            <br>
            • Provide personal information
            <br>
            • Give them an OTP or PIN

            <br><br>

            Be suspicious of unexpected prizes,
            especially when you are asked to pay money
            or provide sensitive information to claim them.
        `
    }

};


/* =========================================================
   ADD MESSAGE
========================================================= */

function addMessage(text, type) {

    const message = document.createElement("div");

    message.className = `message ${type}`;

    message.innerHTML = `
        ${text}
        <div class="time">now</div>
    `;

    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;
}


/* =========================================================
   MAIN MENU
========================================================= */

function showMainMenu() {

    currentMenu = "main";

    waitingForScamMessage = false;

    input.placeholder = "Reply with a number...";

    const menu = `
        👋 <strong>Welcome to Mukuru</strong>

        <br><br>

        How can we help keep you safe?

        <div class="menu-options">
            <div>1. 🛡️ Scam Shield</div>
            <div>2. 🧠 Fraud Prevention Tips</div>
        </div>

        <div class="number-hint">
            Reply with the number of your choice.
        </div>
    `;

    addMessage(menu, "incoming");
}


/* =========================================================
   SCAM SHIELD MENU
========================================================= */

function showScamShield() {

    currentMenu = "scam";

    waitingForScamMessage = true;

    input.placeholder = "Type suspicious message...";

    const menu = `
        🛡️ <strong>SCAM SHIELD</strong>

        <br><br>

        Paste or type the suspicious message
        you want me to check.

        <br><br>

        I'll analyse it for scam indicators
        and explain what you should do.

        <br><br>

        <strong>0. Main Menu</strong>
    `;

    addMessage(menu, "incoming");
}


/* =========================================================
   FRAUD PREVENTION MENU
========================================================= */

function showFraudTips() {

    currentMenu = "tips";

    waitingForScamMessage = false;

    input.placeholder = "Choose a topic number...";

    const menu = `
        🧠 <strong>FRAUD PREVENTION TIPS</strong>

        <br><br>

        Choose a topic:

        <div class="menu-options">
            <div>1. 🚨 Warning Signs</div>
            <div>2. 🔐 Protect Your Information</div>
            <div>3. 🔗 Suspicious Links</div>
            <div>4. 📞 Fake Calls</div>
            <div>5. 💰 Payment Scams</div>
            <div>6. 🏆 Prize & Giveaway Scams</div>
        </div>

        <div class="number-hint">
            Reply with a number.
            <br>
            0. Main Menu
        </div>
    `;

    addMessage(menu, "incoming");
}


/* =========================================================
   SHOW TIP CONTENT DIRECTLY
========================================================= */

function showTipContent(topicNumber) {

    const topic = tips[topicNumber];

    currentMenu = "read";

    input.placeholder = "Reply with 0 to go back...";

    const content = `
        <div class="read-content">

            ${topic.read}

            <br><br>

            <strong>0. Back to Fraud Prevention Tips</strong>

        </div>
    `;

    addMessage(content, "incoming");
}


/* =========================================================
   SCAM MESSAGE CHECK
========================================================= */

async function checkMessage(message) {

    addMessage(message, "outgoing");

    input.value = "";

    const checking = document.createElement("div");

    checking.className = "message incoming";

    checking.id = "checking";

    checking.innerHTML = `
        🛡️ Checking this message...
    `;

    chat.appendChild(checking);

    chat.scrollTop = chat.scrollHeight;


    try {

        const response = await fetch(
            "http://127.0.0.1:8000/check-message",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    message: message
                })
            }
        );


        const data = await response.json();


        const checkingMessage =
            document.getElementById("checking");

        if (checkingMessage) {
            checkingMessage.remove();
        }


        displayResult(data);


    } catch (error) {

        const checkingMessage =
            document.getElementById("checking");

        if (checkingMessage) {
            checkingMessage.remove();
        }


        addMessage(
            `
            ⚠️ I couldn't connect to Scam Shield.

            <br><br>

            Please make sure the Scam Shield
            backend is running.

            <br><br>

            0. Main Menu
            `,
            "incoming"
        );

        console.error(error);
    }
}


/* =========================================================
   DISPLAY SCAM RESULT
========================================================= */

function displayResult(data) {

    const risk = data.risk;

    let riskClass = "risk-low";


    if (risk.risk_level === "HIGH") {

        riskClass = "risk-high";

    } else if (risk.risk_level === "MEDIUM") {

        riskClass = "risk-medium";
    }


    let reasonsHTML = "";


    risk.reasons.forEach(reason => {

        reasonsHTML += `
            <div class="reason">
                • ${reason}
            </div>
        `;

    });


    const resultHTML = `

        <div class="shield">

            <div class="shield-title">
                🛡️ Scam Shield Analysis
            </div>


            <div class="${riskClass}">
                ${risk.risk_level} RISK —
                ${risk.risk_score}/100
            </div>


            <br>


            <div class="warning">

                ⚠️ <strong>WARNING</strong>

                <br>

                ${risk.warning}

            </div>


            <br>


            <strong>Why?</strong>


            <br><br>


            ${reasonsHTML ||
                "<div class='reason'>No major scam indicators detected.</div>"
            }


            <div class="action">

                <strong>
                    What should you do?
                </strong>

                <br>

                ${risk.recommended_action}

            </div>


            <br>

            <strong>0. Main Menu</strong>

        </div>
    `;


    currentMenu = "result";

    waitingForScamMessage = false;

    input.placeholder = "Reply with 0 to go back...";

    addMessage(resultHTML, "incoming");
}


/* =========================================================
   HANDLE NUMBER INPUT
========================================================= */

async function handleInput() {

    const value = input.value.trim();


    if (!value) {
        return;
    }


    /* =====================================================
       SCAM SHIELD
    ===================================================== */

    if (
        currentMenu === "scam" &&
        waitingForScamMessage
    ) {

        if (value === "0") {

            addMessage("0", "outgoing");

            input.value = "";

            showMainMenu();

            return;
        }


        await checkMessage(value);

        return;
    }


    /* =====================================================
       MAIN MENU
    ===================================================== */

    if (currentMenu === "main") {

        addMessage(value, "outgoing");

        input.value = "";


        if (value === "1") {

            showScamShield();

        } else if (value === "2") {

            showFraudTips();

        } else {

            addMessage(
                `
                ⚠️ Please choose:

                <br><br>

                1. 🛡️ Scam Shield
                <br>
                2. 🧠 Fraud Prevention Tips
                `,
                "incoming"
            );
        }

        return;
    }


    /* =====================================================
       FRAUD PREVENTION TOPICS (DIRECT DISPLAY)
    ===================================================== */

    if (currentMenu === "tips") {

        addMessage(value, "outgoing");

        input.value = "";


        if (value === "0") {

            showMainMenu();

            return;
        }


        if (tips[value]) {

            showTipContent(value);

        } else {

            addMessage(
                `
                ⚠️ Invalid option.

                <br><br>

                Please choose a number from 1 to 6.

                <br><br>

                0. Main Menu
                `,
                "incoming"
            );
        }

        return;
    }


    /* =====================================================
       READ SCREEN
    ===================================================== */

    if (currentMenu === "read") {

        addMessage(value, "outgoing");

        input.value = "";


        if (value === "0") {

            showFraudTips();

        } else {

            addMessage(
                `
                Please enter:

                <br><br>

                0. Back
                `,
                "incoming"
            );
        }

        return;
    }


    /* =====================================================
       SCAM RESULT
    ===================================================== */

    if (currentMenu === "result") {

        addMessage(value, "outgoing");

        input.value = "";


        if (value === "0") {

            showMainMenu();

        } else {

            addMessage(
                `
                Please enter:

                <br><br>

                0. Main Menu
                `,
                "incoming"
            );
        }

        return;
    }

}


/* =========================================================
   EVENTS
========================================================= */

sendButton.addEventListener(
    "click",
    handleInput
);


input.addEventListener(
    "keypress",
    function(event) {

        if (event.key === "Enter") {

            handleInput();

        }

    }
);