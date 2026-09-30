// utils/emailTemplates/sessionCancelled.js
export const generateCancelledEmail = ({ fullName, session }) => {
  return `
    <div style="direction: ltr; font-family: Arial, sans-serif; padding: 20px;">
      <h2>Hello ${fullName},</h2>
      <p>We would like to inform you that your class has been cancelled:</p>
      <ul>
        <li><strong>Class Type:</strong> ${session.type}</li>
        <li><strong>Date:</strong> ${new Date(session.date).toLocaleDateString("en-US")}</li>
        <li><strong>Time:</strong> ${session.time}</li>
        <li><strong>Location:</strong> ${session.location}</li>
      </ul>
      <p>We look forward to seeing you in upcoming sessions! 🙏</p>
    </div>
  `;
};
