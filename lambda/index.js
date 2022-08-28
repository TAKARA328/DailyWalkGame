// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa   = require('ask-sdk-core');
const Adapter = require('ask-sdk-dynamodb-persistence-adapter');   // Required for 'ask-sdk-core'.
const geolib  = require('geolib');

// 16方位 22.5度
const DirectionName  = ["North","North-northeast","Northeast", "East-northeast", "East", "East-southeast", "Southeast", "South-southeast", "South", "South-southwest", "Southwest", "West-southwest", "West", "West-northwest", "Northwest", "North-northwest", "North"];
const ReferenceAngle = 22.5;

const DistanceMin = 950;
const DistanceMax = 1020;
const Hint        = 50;
const SkillTitle  = "Daily Walk Game";

const apla_document  = require('./apla/document.js');
const apla_directive = require('./apla/directive.js');
const apla_data      = require('./apla/data.js');

// DynamoDB config
const config = {
    tableName: 'DailyWalkGame',   // DynamoDB Table name
    createTable: true             // table create
};
const DynamoDBAdapter = new Adapter.DynamoDbPersistenceAdapter(config);

// getLatitudeLongitude 地点オブジェクトにセット
function getLatitudeLongitude(obj){ 
    console.log(`function getLatitudeLongitude`);
    let ret = {};
    ret.latitude  = obj.latitudeInDegrees;
    ret.longitude = obj.longitudeInDegrees;
    console.log(`getLatitudeLongitude:Set ${JSON.stringify(ret)}`);    
    return ret;
}

// setLatitudeLongitude 地点オブジェクトにセット
function setLatitudeLongitude(obj){ 
    console.log(`function setLatitudeLongitude`);
    let ret = {};
    ret.latitudeInDegrees  = obj.latitudeInDegrees;
    ret.longitudeInDegrees = obj.longitudeInDegrees;
    console.log(`setLatitudeLongitude:Set ${JSON.stringify(ret)}`);    
    return ret;
}
// getRandomInt
function getRandomInt(min, max) {
    console.log(`function getRandomInt`);
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

// 位置情報の使用が可能か
function isGeoSupported(obj) {
    console.log(`function isGeoSupported`);
    let returnCode = 9;
    const { requestEnvelope, responseBuilder } = obj;
    const Geolocation = requestEnvelope.context.System.device.supportedInterfaces.Geolocation;
    const geoObject = requestEnvelope.context.Geolocation;
    console.log(`geoObject: ${JSON.stringify(geoObject)}`);
    if (Geolocation) {
        let ACCURACY_THRESHOLD = 100; // 100メートルの精度が必要
        if (geoObject && geoObject.coordinate && geoObject.coordinate.accuracyInMeters < ACCURACY_THRESHOLD ) { 
            returnCode = 0;
        } else if ( !geoObject || !geoObject.coordinate ) {
            returnCode = 2;
        }
    } else {
        returnCode = 1;
    } 
    console.log(`ReturnCode ${returnCode}`);
    return returnCode;
}

// 位置情報が使えない場合のメッセージ
function getGeoUnsupportMessage(obj, code) {
    console.log(`function getGeoUnsupportMessage`);
    let speakOutput = '';
    if ( code === 1 ) {
        speakOutput = 'Your Echo device can\'t get location information. Please use Alexa APP or Echo Buds.';
        obj.withShouldEndSession(true)
    } else {
        speakOutput = 'This skill would like to use your location. To turn on location sharing, please go to your Alexa app, and follow the instructions.';
        obj.withAskForPermissionsConsentCard(['alexa::devices:all:geolocation:read'])
    } 
    // APL-A
    obj = setAPLA(obj, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_player1_01', 'speak');
    return obj;
}

// APL-A のディレクティブを設定する
function setAPLA(obj, ssml, audio, type) {
    console.log(`function setAPLA`);
    let doc  = new apla_document();
    let apla = new apla_directive();
    let data = new apla_data();
    // APL-A
    data.myData.ssml  = ssml;
    data.myData.audio = audio;
    apla.document     = doc;
    apla.datasources  = data;
    console.log(`apla_directive: ${JSON.stringify(apla)}`);
    if (type === 'speak') {
        return obj.addDirective(apla);
    } else {
        return obj.addDirectiveToReprompt(apla);
    }
}

// LaunchRequest
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        console.log(`LaunchRequestHandler`);
        console.log(`handlerInput ${JSON.stringify(handlerInput)}`);
        let speakOutput = 'Welcome, ';
        let speakOutputReprompt = 'Welcome, ';

        let { requestEnvelope, responseBuilder } = handlerInput;
        const geoObject = requestEnvelope.context.Geolocation;0

        //　カスタムタスクを取得する。位置情報より後だとSMAPIのテストができないので、ここに置いた。
        const task = requestEnvelope.request.task;
        console.log(`LaunhcRequestHandler Custom task object: ${JSON.stringify(task)}`);
        let CustomTaskDirectionId = null;
        if (task != undefined) {
          if (task.name === 'amzn1.ask.skill.190effea-2563-48f6-a3ae-6cfe50ec69f0.Direction') {
            CustomTaskDirectionId = task.input.enumName;
            console.log(`LaunhcRequestHandler Custom task id: ${CustomTaskDirectionId}`);
          }
        }
 
        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;

        // Card
        let CardInfo = "Initializing...";

        // Welcome message
        if (persistentAttributes.LaunchCnt === undefined) {
            // 初回起動
            gameData = {};
            gameData.Status = 'INIT';

            speakOutput = 'Welcome. This game uses location information. Therefore, it is necessary to register the base point, is it okay to register this point?';
            speakOutputReprompt = 'Is it okay to register this point?';
        } else {
            console.log(`gameData.Status ${JSON.stringify(persistentAttributes.gameData.Status)}`);
            if (gameData.Status === 'DONE') { // ゲーム終了状態
                gameData = {};
                gameData.Status = 'INIT';
                speakOutput = 'Welcome back. Let\'s enjoy a walk today. Is it OK to use the location information here as a base point?';
                speakOutputReprompt = 'Is it okay to register this point?';
            } else if (gameData.Status === 'INGAME') {  // ゲーム中の状態
                CardInfo = "In game...";
                speakOutput = 'Welcome back. Can I help you with something? Do you want to check? Or want to hear a hint? Or play New Game?';
                speakOutputReprompt = 'Which one do you want?';
            } else if (gameData.Status === 'INIT') {  // ゲーム設定の状態
                CardInfo = "In game...";
                speakOutput = 'Welcome back. I will start from where we left off. Is it OK to use the location information here as a base point?';
                speakOutputReprompt = 'Is it okay to register this point?';
            } else { // ゲーム登録の状態
                CardInfo = "In game...";
                speakOutput = 'Welcome back. I will start from where we left off. Do you start a walk? Or Change to another goal?';
                speakOutputReprompt = 'Do you start a walk? Or Change to another goal?';
            }
            // undefinedは発生しない
        }
        if (CustomTaskDirectionId !== null) {
            gameData.DirectionId = CustomTaskDirectionId;
        }
        persistentAttributes.gameData = gameData;
        console.log(`persistentAttributes.gameData : ${persistentAttributes.gameData}`);

        persistentAttributes.LaunchCnt = (persistentAttributes.LaunchCnt | 0) + 1;
        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');
        responseBuilder = setAPLA(responseBuilder, speakOutputReprompt, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'reprompt');

        console.log('INIT');
        return responseBuilder
            .withSimpleCard(SkillTitle, CardInfo)
            .getResponse();
    }
};

const CheckIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CheckIntent';
    },
    async handle(handlerInput) {
        console.log(`CheckIntentHandler`);
        let speakOutput = '';
        let speakOutputReprompt = '';

        let { requestEnvelope, responseBuilder } = handlerInput;
        const geoObject = requestEnvelope.context.Geolocation;

        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;
        const TargetDistance = gameData.TargetDistance;
        const TargetDirection = gameData.TargetDirection;

        console.log(`gameData.Status ${JSON.stringify(persistentAttributes.gameData.Status)}`);
        if (gameData.Status != 'INGAME') { // ゲーム中の状態じゃないとき
            speakOutput = 'The game hasn\'t started. And, register your location information. Is it OK to use the location information here as a base point?';
            // APL-A
            responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');
            responseBuilder = setAPLA(responseBuilder, speakOutputReprompt, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'reprompt');
            return responseBuilder
                .getResponse();
        }

        // 登録情報から
        const Point1 = getLatitudeLongitude(persistentAttributes.coordinate);

        // 位置情報サービスから
        const Point2 = getLatitudeLongitude(geoObject.coordinate);

        // ２拠点間の角度
        const GreatCircleBearing = geolib.getGreatCircleBearing(Point1, Point2);
        console.log(`geolib.getGreatCircleBearing ${JSON.stringify(GreatCircleBearing)}`);

        // ２拠点間の距離
        const Distance = geolib.getDistance(Point1, Point2, accuracy = 1)
        console.log(`geolib.getDistance ${JSON.stringify(Distance)}`);

        // ２点間の角度から方位に変換する
        const DirectionIndex = Math.round( GreatCircleBearing / ReferenceAngle );
        let ApproximateDirection = ';'
        console.log(`TargetDirection : ${TargetDirection} / CurrentDirection : ${DirectionName[DirectionIndex]}`);
        if (DirectionName[DirectionIndex] === TargetDirection) {
            ApproximateDirection = 'matched';
        } else {
            ApproximateDirection = 'not match';
        }

        let ApproximateDistance = Math.abs(TargetDistance - Distance);

        // 判定
        let ResultLank = '';
        if (ApproximateDirection === 'matched') {
            if (ApproximateDistance === 0) {
                ResultLank = 'perfect!';
            } else if (ApproximateDistance < 30) {
                ResultLank = 'excellent!';
            } else if (ApproximateDistance < 100) {
                ResultLank = 'good';
            } else {
                ResultLank = 'no good';
            }
        } else {
            if (ApproximateDistance === 0) {
                ResultLank = 'good';
            } else if (ApproximateDistance < 30) {
                ResultLank = 'good';
            } else {
                ResultLank = 'no good';
            }
        }
        speakOutput = `OK. I'm checking. <break time="1s"/>. Your directions ${ApproximateDirection} and the distance differed by ${ApproximateDistance} meters. <break time="1s"/>Your results were <break time="1s"/> ${ResultLank}. See you next time.`;

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/musical/amzn_sfx_drum_comedy_01', 'speak');

        // Card
        const CardInfo = "\nGoal\nDistance : " + TargetDistance + "\nDirection : " + gameData.TargetDirection + "\n \nCurrent\nDistance : " + Distance + "\nDirection : " + DirectionName[DirectionIndex] + "\n \nTo the destination : " + (Math.abs(TargetDistance - Distance));

        // 全ての処理が終わってからゲームデータを消す
        gameData = {};
        gameData.Status = 'DONE';
        persistentAttributes.gameData = gameData;
        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        console.log('CHECK');
        return responseBuilder
            .withSimpleCard(SkillTitle, CardInfo)
            .withShouldEndSession(true)
            .getResponse();
    }
};

const HintIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HintIntent';
    },
    async handle(handlerInput) {
        console.log(`HintIntentHandler`);
        let speakOutput = 'Ok. I will give you a hint. The current direction is south and the distance is a little short.';
        let speakOutputReprompt = '';

        let { requestEnvelope, responseBuilder } = handlerInput;
        const geoObject = requestEnvelope.context.Geolocation;

        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;
        const TargetDistance = gameData.TargetDistance;
        let NumberOfHints = gameData.NumberOfHints;

        console.log(`gameData.Status ${JSON.stringify(persistentAttributes.gameData.Status)}`);
        if (gameData.Status != 'INGAME') { // ゲーム中の状態じゃないとき
            speakOutput = 'The game hasn\'t started. And, register your location information. Is it OK to use the location information here as a base point?';
            // APL-A
            responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');
            responseBuilder = setAPLA(responseBuilder, speakOutputReprompt, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'reprompt');
            return responseBuilder
                .getResponse();
        }

        // 登録情報から
        const Point1 = getLatitudeLongitude(persistentAttributes.coordinate);

        // 位置情報サービスから
        const Point2 = getLatitudeLongitude(geoObject.coordinate);

        // ２拠点間の角度
        const GreatCircleBearing = geolib.getGreatCircleBearing(Point1, Point2);
        console.log(`geolib.getGreatCircleBearing ${JSON.stringify(GreatCircleBearing)}`);

        // ２拠点間の距離
        const Distance = geolib.getDistance(Point1, Point2, accuracy = 1)
        console.log(`geolib.getDistance ${JSON.stringify(Distance)}`);

        // ２点間の角度から方位に変換する
        const DirectionIndex = Math.round( GreatCircleBearing / ReferenceAngle );
        // 距離で発話を変える
        let DistanceMessage = 'It\'s getting closer.';  //'Go break a leg!';
        let ApproximateDistance = TargetDistance - Distance;
        if (ApproximateDistance > 100) {
            // まだまだたりない
            DistanceMessage = 'so, Let\'s walk more.';
        } else if (ApproximateDistance < -9000) {
            // クレイジー
            DistanceMessage = 'Wow. You have walked more than 10 kilometers. hmm, <break time="0.5s"/> Let\'s finish the game by saying check.';
        } else if (ApproximateDistance < -1000) {
            // めっちゃ行き過ぎ
            DistanceMessage = 'You should make plans to return.';
        } else if (ApproximateDistance < 0) {
            // こえてる
            DistanceMessage = 'You are already over the goal point.';
        }

        if (NumberOfHints === 0 ) {
            speakOutput = `Hints are up to 50 times. From now on, please wait on your own. bye.`;

        } else {
            NumberOfHints--;
            gameData.NumberOfHints = NumberOfHints;
            console.log(`gameData ${JSON.stringify(gameData)}`);        
            persistentAttributes.gameData = gameData;
    
            speakOutput = `Ok. I will give you a hint. This point is ${Distance} meters from the starting point. and the direction is ${DirectionName[DirectionIndex]}. The goal point is ${TargetDistance} meters and the direction is ${gameData.TargetDirection}. ${DistanceMessage}`;
        }

        console.log(`persistentAttributes ${JSON.stringify(persistentAttributes)}`);        
        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_player1_01', 'speak');

        // Card
        const CardInfo = "\nGoal\nDistance : " + TargetDistance + "\nDirection : " + gameData.TargetDirection + "\n \nCurrent\nDistance : " + Distance + "\nDirection : " + DirectionName[DirectionIndex] + "\n \nTo the destination : " + (Math.abs(TargetDistance - Distance));

        console.log('HINT');
        return responseBuilder
            .withSimpleCard(SkillTitle, CardInfo)
            .withShouldEndSession(true)
            .getResponse();
    }
};

const RegisterIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
           && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' 
           ||  Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnotherIntent'
           ||  Alexa.getIntentName(handlerInput.requestEnvelope) === 'NewGameIntent');
    },
    async handle(handlerInput) {
        console.log(`RegisterIntentHandler`);
        let speakOutput = '';
        let speakOutputReprompt = 'Do you want to start a walk? Or Change to another goal?';
        let { requestEnvelope, responseBuilder } = handlerInput;
        const geoObject = requestEnvelope.context.Geolocation;

        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;
        console.log(`gameData : ${gameData}`);
        if (gameData.DirectionId === undefined) {
            gameData.DirectionId = null;
        }
        console.log(`Get Attributes from DynamoDB`);
        persistentAttributes.coordinate = setLatitudeLongitude(geoObject.coordinate);

        // 目的の距離を決める
        const TargetDistance = getRandomInt(DistanceMin, DistanceMax);
        let DirectionIndex = 0;
        // 目的の方角を決める
        if (gameData.DirectionId === null) {
            DirectionIndex = Math.floor( Math.random() * DirectionName.length );
        } else {
            DirectionIndex = Number(gameData.DirectionId);
        }
        const TargetDirection = DirectionName[DirectionIndex];
        console.log(`TargetDistance : ${TargetDistance} / TargetDirection : ${TargetDirection}`);

        // gameData = {};
        gameData.TargetDirection = TargetDirection;
        gameData.TargetDistance = TargetDistance;
        gameData.Status = 'REG';
        gameData.NumberOfHints = Hint;
        persistentAttributes.gameData = gameData;
        console.log(`persistentAttributes ${JSON.stringify(persistentAttributes)}`);

        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        if (Alexa.getIntentName(handlerInput.requestEnvelope) === 'NewGameIntent') {
            speakOutput = `I got it. Start a new game. I got the location information of this point. Set as the starting point of the game. The goal for this time is  ${TargetDistance} meters to ${TargetDirection}. Do you start a walk? Or Change to another goal?`;
        } else {
            speakOutput = `I got it. I got the location information of this point. Set as the starting point of the game. The goal for this time is  ${TargetDistance} meters to ${TargetDirection}. Do you start a walk? Or Change to another goal?`;
        }

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_player1_01', 'speak');
        responseBuilder = setAPLA(responseBuilder, speakOutputReprompt, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_player1_01', 'reprompt');

        console.log('REG');
        return responseBuilder
            .getResponse();
    }
};

const StartWalkIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartWalkIntent';
    },
    async handle(handlerInput) {
        console.log(`StartWalkIntentHandler`);
        console.log(`handlerInput ${JSON.stringify(handlerInput)}`);
        let speakOutput = 'all right. Are you ready? But before you leave, don\'t go to dangerous places. so, Let\'s get started.';
        let { requestEnvelope, responseBuilder } = handlerInput;

        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        console.log(`persistentAttributes ${JSON.stringify(persistentAttributes)}`);
        let gameData = persistentAttributes.gameData;
        gameData.Status = 'INGAME';

        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_player1_01', 'speak');

        console.log('START');
        return responseBuilder
            .withShouldEndSession(true)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        console.log(`FallbackIntentHandler:`);
        let { requestEnvelope, responseBuilder } = handlerInput;
        const speakOutput = 'Can you say that again?';

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');

        return responseBuilder
            /// .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        console.log(`HelpIntentHandler:`);
        let speakOutput = `It is a skill to enjoy a walk. Say HINT if you want to know your current location. Say CHECK when you reach your destination. If the skill session has expired, please do a one-shot launch such as 'Ask daily walk game to HINT'. Let's continue the game. `;
        let { requestEnvelope, responseBuilder } = handlerInput;

        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;

        if (gameData != undefined) {
            if (gameData.Status === 'DONE') { // ゲーム終了状態
                speakOutput = speakOutput + 'Is it OK to use the location information here as a base point?';
                speakOutputReprompt = 'Is it okay use the location information?';
            } else if (gameData.Status === 'INGAME') {  // ゲーム中の状態
                speakOutput = speakOutput + 'Do you want to check? Or want to hear a hint? Or play New Game?';
                speakOutputReprompt = 'Which one do you want?';
            } else if (gameData.Status === 'INIT') {  // ゲーム設定の状態
                speakOutput = speakOutput + 'Is it OK to use the location information here as a base point?';
                speakOutputReprompt = 'Is it okay use the location information?';
            } else if (gameData.Status === 'GET') {  // ゲーム登録の状態
                speakOutput = speakOutput + 'Do you start a walk? Or Change to another goal?';
                speakOutputReprompt = 'Do you start a walk? Or Change to another goal?';
            }
        } else { // 初回
            speakOutput = speakOutput + 'Welcome back. Start the continuation of last time. Do you start a walk? Or Change to another goal?';
            speakOutputReprompt = 'Do you start a walk? Or Change to another goal?';
        }
 
        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');

        return responseBuilder
            // .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent');
    },
    async handle(handlerInput) {
        console.log(`CancelAndStopIntentHandler:`);
        // 位置情報が利用可能かを判別する。
        const returnCode = isGeoSupported(handlerInput);
        if (returnCode != 0) {
            // サポート外メッセージ
            return getGeoUnsupportMessage(responseBuilder, returnCode).getResponse();
        }

        let { requestEnvelope, responseBuilder } = handlerInput;
        const speakOutput = 'See you next time! bye.';

        // Get Attributes from DynamoDB
        let persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        let gameData = persistentAttributes.gameData;

        // 全ての処理が終わってからゲームデータを消す
        gameData = {};
        gameData.Status = 'DONE';
        persistentAttributes.gameData = gameData;

        // Set Attributes to DynamoDB (User Infomations)
        console.log(`Set Attributes to DynamoDB (User Infomations)`);
        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');

        return responseBuilder
            .withShouldEndSession(true)
            .getResponse();
    }
};

const SkillDisabledEventHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillDisabled';
    },
    async handle(handlerInput) {
      console.log('SkillDisabledEventHandler ');
      if (!handlerInput.attributesManager.deletePersistentAttributes) return
      await handlerInput.attributesManager.deletePersistentAttributes()
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`SessionEndedRequestHandler:`);
        let { requestEnvelope, responseBuilder } = handlerInput;

        // Any cleanup logic goes here.
        return responseBuilder
            .getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        console.log(`IntentReflectorHandler:`);
        let { requestEnvelope, responseBuilder } = handlerInput;
        const intentName = Alexa.getIntentName(requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');

        return responseBuilder
            // .speak(speakOutput)
            // .reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};


// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        let { requestEnvelope, responseBuilder } = handlerInput;
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        // APL-A
        responseBuilder = setAPLA(responseBuilder, speakOutput, 'soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01', 'speak');
        
        return responseBuilder
            // .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        RegisterIntentHandler,
        HintIntentHandler,
        CheckIntentHandler,
        StartWalkIntentHandler,
        FallbackIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SkillDisabledEventHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
        ) 
    .addErrorHandlers(
        ErrorHandler,
    )
   .withPersistenceAdapter(DynamoDBAdapter)
    .lambda();

