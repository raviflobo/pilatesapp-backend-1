// utils/emailTemplates/sessionUpdated.js
export const generateUpdatedSessionEmail = ({
  fullName,
  session,
  updatedSession,
}) => {
  return `
    <div style="direction: ltr; font-family: Arial, sans-serif; padding: 20px;">
      <h2>Hello ${fullName},</h2>
      <p>A change has been made to a class you are registered for:</p>
      <ul>
        <li><strong>Class Type:</strong> ${session.type}</li>
        <li><strong>Date:</strong> ${new Date(session.date).toLocaleDateString("en-US")}</li>
        <li><strong>Time:</strong> ${session.time}</li>
        <li><strong>Location:</strong> ${session.location}</li>
      </ul>

      <p>The updated class details are:</p>
      <ul>
        <li><strong>Class Type:</strong> ${updatedSession.type}</li>
        <li><strong>Date:</strong> ${new Date(updatedSession.date).toLocaleDateString("en-US")}</li>
        <li><strong>Time:</strong> ${updatedSession.time}</li>
        <li><strong>Location:</strong> ${updatedSession.location}</li>
      </ul>
    </div>
  `;
};
