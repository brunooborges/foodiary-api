import OpenAI, { toFile } from 'openai';

const client = new OpenAI();

export async function transcribeAudio(fileBuffer: Buffer) {
  const transcription = await client.audio.transcriptions.create({
    model: 'whisper-1',
    language: 'pt',
    response_format: 'text',
    file: await toFile(fileBuffer, 'audio.m4a', { type: 'audio/m4a' }),
  });

  return transcription;
}

type GetMealDetailsFromTextParams = {
  text: string;
  createdAt: Date;
};

export async function getMealDetailsFromText({ createdAt, text }: GetMealDetailsFromTextParams) {
  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: `
          Você é um nutricionista e está atendendo um de seus pacientes. Você deve responder para ele seguindo as instruções a baixo.

          Seu papel é:
          1. Dar um nome e escolher um emoji para a refeição baseado no horário dela.
          2. Identificar os alimentos no áudio.
          3. Estimar, para cada alimento identificado:
            - Nome do alimento (em português)
            - Quantidade aproximada (em gramas ou unidades)
            - Calorias (kcal)
            - Carboidratos (g)
            - Proteínas (g)
            - Gorduras (g)

          Seja direto, objetivo e evite explicações. Apenas retorne os dados em JSON no formato abaixo:

          {
            "name": "Jantar",
            "icon": "🍗",
            "foods": [
              {
                "name": "Arroz branco cozido",
                "quantity": "150g",
                "calories": 193,
                "carbohydrates": 42,
                "proteins": 3.5,
                "fats": 0.4
              },
              {
                "name": "Peito de frango grelhado",
                "quantity": "100g",
                "calories": 165,
                "carbohydrates": 0,
                "proteins": 31,
                "fats": 3.6
              }
            ]
          }
        `,
      },
      {
        role: 'user',
        content: `
          Data: ${createdAt}
          Refeição: ${text}
        `,
      },
    ],
  });
  const json = response.choices[0].message.content;

  if (!json) {
    throw new Error('Failed to process meal');
  }

  return JSON.parse(json);
}

type GetMealDetailsFromImageParams = {
  imageURL: string;
  createdAt: Date;
};

export async function getMealDetailsFromImage({ createdAt, imageURL }: GetMealDetailsFromImageParams) {
  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: `
          Meal date: ${createdAt}

          Você é um nutricionista especializado em análise de alimentos por imagem. A imagem a seguir foi tirada por um usuário com o objetivo de registrar sua refeição.

          Seu papel é:
          1. Dar um nome e escolher um emoji para a refeição baseado no horário dela.
          2. Identificar os alimentos presentes na imagem.
          3. Estimar, para cada alimento identificado:
            - Nome do alimento (em português)
            - Quantidade aproximada (em gramas ou unidades)
            - Calorias (kcal)
            - Carboidratos (g)
            - Proteínas (g)
            - Gorduras (g)

          Considere proporções e volume visível para estimar a quantidade. Quando houver incerteza sobre o tipo exato do alimento (por exemplo, tipo de arroz, corte de carne), use o tipo mais comum. Seja direto, objetivo e evite explicações. Apenas retorne os dados em JSON no formato abaixo:

          {
            "name": "Jantar",
            "icon": "🍗",
            "foods": [
              {
                "name": "Arroz branco cozido",
                "quantity": "150g",
                "calories": 193,
                "carbohydrates": 42,
                "proteins": 3.5,
                "fats": 0.4
              },
              {
                "name": "Peito de frango grelhado",
                "quantity": "100g",
                "calories": 165,
                "carbohydrates": 0,
                "proteins": 31,
                "fats": 3.6
              }
            ]
          }

        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageURL,
            },
          },
        ],
      },
    ],
  });

  const json = response.choices[0].message.content;

  if (!json) {
    throw new Error('Failed to process meal.');
  }

  return JSON.parse(json);
}
