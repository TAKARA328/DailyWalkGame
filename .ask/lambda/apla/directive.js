module.exports = apla_directive;

function apla_directive() {
    return {
        type: "Alexa.Presentation.APLA.RenderDocument",
        token: "token",
        document: "apla_document",
        datasources: "apla_data"
    }
}
