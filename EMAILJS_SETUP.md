# TimeMachine Email Setup (100% Optional)

⚠️ **Important**: Email setup is completely optional! TimeMachine works perfectly without any email configuration.

## 📥 Your Options:

### Option 1: PDF Reports Only (No Setup Required)
- ✅ **Download PDF reports** anytime from Settings
- ✅ **Beautiful formatted reports** with charts and session details  
- ✅ **Zero configuration** needed
- ✅ **Complete privacy** - no external services

### Option 2: Email Reports (Optional Setup)
- ✅ **Everything from Option 1** PLUS email delivery
- ✅ **Use your own EmailJS account** (free)
- ✅ **Send reports to yourself** 
- ✅ **Test email functionality**

---

## 🚀 If You Want Email Reports:

EmailJS allows you to send emails directly from your Chrome extension using your own free account.

## Step 1: Create EmailJS Account
1. Go to [https://www.emailjs.com](https://www.emailjs.com)
2. Click "Sign Up" and create a free account
3. Verify your email address

## Step 2: Connect Your Email Service
1. In EmailJS dashboard, go to "Email Services"
2. Click "Add New Service"
3. Choose your email provider (Gmail recommended):
   - **Gmail**: Click "Connect Account" and authorize with your Google account
   - **Outlook**: Use your Microsoft account
   - **Other**: Follow the SMTP setup instructions

## Step 3: Create Email Template
1. Go to "Email Templates" in the dashboard
2. Click "Create New Template"  
3. Use this template content:

**Template Variables to include:**
- `{{subject}}` - Email subject
- `{{message}}` - Email content
- `{{to_email}}` - Recipient email

**Example template:**
```
Subject: {{subject}}

Hello,

{{message}}

--
Sent via TimeMachine Extension
```

4. Save the template and note the **Template ID** (e.g., `template_abc123`)

## Step 4: Get Your Configuration Values
1. Go to "Account" > "API Keys"
2. Copy your **Public Key** (e.g., `user_xyz789`)
3. From "Email Services", copy your **Service ID** (e.g., `service_def456`)

## Step 5: Update Extension Configuration
Open `extension/popup.js` and update the EmailJS configuration:

```javascript
EMAILJS: {
  SERVICE_ID: "service_def456", // Your Service ID from step 4
  TEMPLATE_ID: "template_abc123", // Your Template ID from step 3
  PUBLIC_KEY: "user_xyz789" // Your Public Key from step 4
}
```

## Step 6: Test Your Setup
1. Reload your Chrome extension
2. Go to Settings tab in the extension
3. Configure your EmailJS settings
4. Click "Test Email" button
5. Check your inbox for the test email

✅ **You can use both PDF downloads and email reports simultaneously!**

## Troubleshooting

### If emails don't arrive:
1. Check your spam/junk folder
2. Verify all IDs are correct in the configuration
3. Make sure your email service is properly connected in EmailJS dashboard
4. Check the browser console for error messages

### Rate Limits:
- Free tier: 200 emails/month
- If you need more, EmailJS paid plans start at $20/month for 2,000 emails

### Alternative Free Services:
If EmailJS doesn't work for you, try:
1. **Resend** - 3,000 emails/month free
2. **Mailjet** - 6,000 emails/month free
3. **Brevo** - 300 emails/day free

## Security Note
Your EmailJS Public Key is safe to include in the extension - it's designed to be public and can only send emails, not access your account.
