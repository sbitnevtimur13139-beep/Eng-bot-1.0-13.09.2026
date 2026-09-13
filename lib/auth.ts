import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Google появляется в списке способов входа только когда заданы обе переменные. */
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

async function sendMagicLinkEmail(email: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY не задан, ссылку для входа отправить некуда");
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "Speaking Bot <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "Вход в Speaking Bot",
    html: `<p>Нажмите на ссылку, чтобы войти. Она действует 5 минут.</p><p><a href="${url}">Войти в Speaking Bot</a></p>`,
    text: `Ссылка для входа, действует 5 минут: ${url}`,
  });

  if (error) throw new Error(`Resend: ${error.message}`);
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: googleClientId as string,
          clientSecret: googleClientSecret as string,
        },
      }
    : {},

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    // nextCookies обязан идти последним.
    nextCookies(),
  ],
});
