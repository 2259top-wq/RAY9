/*
 * Copyright (c) 2026 2259top-wq
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of 2259top-wq.
 * You shall not disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into with 2259top-wq.
 */

const fs = require('fs');
const readline = require('readline');

const filePath = 'C:\\Users\\Admin\\Downloads\\OptionsDaily_2026_07_13\\OptionsDaily_2026_07_13.csv';

const fileStream = fs.createReadStream(filePath);
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

let count = 0;
rl.on('line', (line) => {
  console.log(line);
  count++;
  if (count > 10) {
    rl.close();
    process.exit(0);
  }
});
