const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const { google } = require('googleapis');
const { OAuth2 } = google.auth;

const app = express();
const PORT = process.env.PORT || 3000;

// Use morgan to log requests to the console
app.use(morgan('dev'));

// Load client secrets from a local file.
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Scopes for Google Contacts API
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

async function getGoogleContacts() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
    } else {
        // Get new token
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const code = await new Promise((resolve) => {
            rl.question('Enter the code from that page here: ', (code) => {
                resolve(code);
            });
        });
        rl.close();
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        // Store the token to disk for later program executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
    }

    const service = google.people({ version: 'v1', auth: oAuth2Client });
    let connections = [];
    let pageToken = null;

    do {
        const res = await service.people.connections.list({
            resourceName: 'people/me',
            pageSize: 1000,
            personFields: 'names,phoneNumbers,emailAddresses',
            pageToken: pageToken,
        });

        connections = connections.concat(res.data.connections || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    const contacts = connections.map((person) => {
        const names = person.names || [];
        const phoneNumbers = person.phoneNumbers || [];
        const emails = person.emailAddresses || [];
        return {
            firstName: names[0] ? names[0].givenName : '',
            lastName: names[0] ? names[0].familyName : '',
            phoneNumber: phoneNumbers[0] ? phoneNumbers[0].value : '',
            email: emails[0] ? emails[0].value : '',
        };
    });

    return contacts;
}

app.get('/generate-phonebook/phonebook.xml', async (req, res) => {
    const now = new Date();
    console.log(`Generating phonebook at ${now.toLocaleString()}...`);
    const googleContacts = await getGoogleContacts();
    console.log(`Number of contacts: ${googleContacts.length}`);

    let phonebookData = `
    <?xml version="1.0" encoding="UTF-8"?>
    <AddressBook>
        <pbgroup>
            <id>1</id>
            <name>Blocklist</name>
        </pbgroup>
        <pbgroup>
            <id>2</id>
            <name>Allowlist</name>
        </pbgroup>
        <pbgroup>
            <id>26</id>
            <name>Blacklist</name>
        </pbgroup>
        <pbgroup>
            <id>27</id>
            <name>Whitelist</name>
        </pbgroup>
        <pbgroup>
            <id>192</id>
            <name>Default</name>
            <ringtones>ring3.bin</ringtones>
            <RingtoneIndex>3</RingtoneIndex>
        </pbgroup>
        <pbgroup>
            <id>193</id>
            <name>Customer</name>
            <ringtones>ring3.bin</ringtones>
            <RingtoneIndex>3</RingtoneIndex>
        </pbgroup>
        <Contact>
            <id>209503</id>
            <FirstName>Aaron</FirstName>
            <LastName>Au</LastName>
            <RingtoneIndex>0</RingtoneIndex>
            <RingtoneUrl>system</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Home">
                <phonenumber>0425352106</phonenumber>
                <accountindex>2</accountindex>
            </Phone>
            <Primary>0</Primary>
            <Mail>aaronau90@gmail.com</Mail>
            <Department/>
        </Contact>
        <Contact>
            <id>209504</id>
            <FirstName>Aaron</FirstName>
            <LastName>Griffith</LastName>
            <RingtoneIndex>0</RingtoneIndex>
            <RingtoneUrl>system</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Home">
                <phonenumber>0473464925</phonenumber>
                <accountindex>2</accountindex>
            </Phone>
            <Primary>0</Primary>
            <Mail/>
            <Department/>
        </Contact>
        <Contact>
            <id>209899</id>
            <FirstName>Hyun</FirstName>
            <LastName>Choi</LastName>
            <RingtoneIndex>3</RingtoneIndex>
            <RingtoneUrl>ring3.bin</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Work">
                <phonenumber>0430139124</phonenumber>
                <accountindex>0</accountindex>
            </Phone>
            <Group>193</Group>
            <Primary>0</Primary>
            <Mail>3supower@gmail.com</Mail>
        </Contact>
    `;

    googleContacts.forEach((contact, index) => {
        phonebookData += `
        <Contact>
            <id>${210000 + index}</id>
            <FirstName>${contact.firstName}</FirstName>
            <LastName>${contact.lastName}</LastName>
            <RingtoneIndex>3</RingtoneIndex>
            <RingtoneUrl>ring3.bin</RingtoneUrl>
            <Frequent>0</Frequent>
            <Phone type="Work">
                <phonenumber>${contact.phoneNumber}</phonenumber>
                <accountindex>1</accountindex>
            </Phone>
            <Group>193</Group>
            <Primary>0</Primary>
            <Mail>${contact.email}</Mail>
            <Department/>
        </Contact>
        `;
    });

    phonebookData += `
    </AddressBook>
    `;

    // Write the XML data to a file
    const filePath = path.join(__dirname, 'phonebook.xml');
    fs.writeFileSync(filePath, phonebookData.trim());
    console.log('Phonebook generated successfully.');

    // res.set('Content-Type', 'application/xml');
    // res.set('Content-Disposition', 'attachment; filename="phonebook.xml"');
    // res.sendFile(filePath);

    // res.send('Phonebook generated successfully. You can access it at /generate-phonebook/phonebook.xml');
    res.sendFile(filePath);
});

// Serve the phonebook.xml file
app.get('/generate-phonebook/remote-phonebook.xml', async (req, res) => {
    const now = new Date();
    console.log(`Generating Yealink Remote phonebook at ${now.toLocaleString()}...`);
    const googleContacts = await getGoogleContacts();
    console.log(`Number of contacts: ${googleContacts.length}`);

    let phonebookData = `
    <?xml version="1.0" encoding="UTF-8"?>
    <YealinkIPPhoneDirectory>
        <DirectoryEntry>
            <Name>Tom</Name>
            <Telephone label="Office Number">66000</Telephone>
        </DirectoryEntry>
        <DirectoryEntry>
            <Name>Jensen</Name>
            <Telephone label="Office Number">29000</Telephone>
            <Telephone label="Other Number">42</Telephone>
        </DirectoryEntry>
        <DirectoryEntry>
            <Name>Phil</Name>
            <Telephone label="Mobile Number">49880</Telephone>
        </DirectoryEntry>
        <DirectoryEntry>
            <Name>Boss</Name>
            <Telephone label="Other Number">10.10.32.147</Telephone>
        </DirectoryEntry>
    `;
    /*
    googleContacts.forEach((contact, index) => {
        phonebookData += `
        <DirectoryEntry>
            <Name>${contact.firstName} ${contact.lastName}</Name>
            <Telephone label="Mobile Number">${contact.phoneNumber}</Telephone>
        </DirectoryEntry>
        `;
    });
    */
    phonebookData += `
    </YealinkIPPhoneDirectory>
    `;

    // Write the XML data to a file
    const filePath = path.join(__dirname, 'remote-phonebook.xml');
    fs.writeFileSync(filePath, phonebookData.trim());
    console.log('Yealink Remote Phonebook generated successfully.');
    res.sendFile(filePath);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});