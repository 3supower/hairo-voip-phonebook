const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/generate-phonebook', (req, res) => {
    const phonebookData = `
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
    </AddressBook>
    `;

    res.set('Content-Type', 'application/xml');
    res.send(phonebookData.trim());
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});