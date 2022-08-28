module.exports = apla_document;

function apla_document() {
    return {
        type: "APLA",
        version: "0.8",
        mainTemplate: {
            parameters: [
                "payload"
            ],
            item: {
                type: "Mixer",
                items: [
                    {
                        type: "Speech",
                        contentType: "SSML",
                        content: "<speak><amazon:domain name='conversational'>${payload.myData.ssml}</amazon:domain></speak>"
                    },
                    {
                        type: "Audio",
                        when: "${payload.myData.audio != ''}",
                        source:"${payload.myData.audio}",
                        filters: [
                            {
                                type: "Volume",
                                amount: "${payload.myData.volume}"
                            },
                            {
                                type: "FadeIn",
                                duration: 200
                            },
                            {
                                type: "FadeOut",
                                duration: 300
                            }
                        ]
                    }
                ]
            }
        }
    }
}