import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const ORION_PROMPT = `
Você é a Orion, uma inteligência artificial pessoal criada para auxiliar o usuário pelo WhatsApp.

PERSONALIDADE:
- Fale naturalmente em português do Brasil.
- Seja direta, inteligente e objetiva.
- Não diga que é humana.
- Não invente informações.
- Se não souber algo, diga claramente.
- Adapte o tamanho da resposta à pergunta.
- Evite respostas excessivamente formais.
- Não use tabelas no WhatsApp.
- Use emojis somente quando fizer sentido.
- Não fique repetindo "como posso ajudar?".
- Entenda o contexto da conversa.

COMPORTAMENTO:
- Responda como uma assistente pessoal, não como um chatbot engessado.
- Ajude o usuário a pensar, pesquisar, planejar e executar tarefas.
- Quando uma tarefa tiver várias etapas, organize-as de maneira simples.
- Antes de executar qualquer ação que possa gastar dinheiro, enviar algo importante ou causar uma consequência externa, peça confirmação.
- Nunca invente que realizou uma ação quando não realizou.

WHATSAPP:
- As respostas devem funcionar bem em mensagens de celular.
- Prefira parágrafos curtos.
- Use listas simples quando necessário.
- Não utilize Markdown excessivo.
`;

app.get("/", (_req, res) => {
  res.status(200).send("Orion webhook online.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "orion-whatsapp-webhook"
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  // A Meta recebe o 200 imediatamente.
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== "text") {
      return;
    }

    const from = message.from;
    const text = message.text?.body;

    if (!from || !text || !openai) {
      return;
    }

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      instructions: ORION_PROMPT,
      input: text
    });

    const reply = response.output_text?.trim();

    if (!reply) {
      return;
    }

    await sendWhatsAppMessage(from, reply);

  } catch (error) {
    console.error("Erro no processamento:", error);
  }
});

async function sendWhatsAppMessage(to, body) {

  if (!META_ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error(
      "META_ACCESS_TOKEN ou PHONE_NUMBER_ID não configurado."
    );
  }

  const url =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,

      type: "text",

      text: {
        preview_url: false,
        body: body
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Meta API ${response.status}: ${JSON.stringify(data)}`
    );
  }

  console.log("Mensagem enviada:", data);
}

app.listen(PORT, () => {
  console.log(`Orion webhook rodando na porta ${PORT}`);
});
