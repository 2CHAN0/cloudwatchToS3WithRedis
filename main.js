const { createClient } = require('redis');
const AWS = require('aws-sdk');
const cloudconfig = {
    apiVersion: '2014-03-28',
    region: 'ap-northeast-2', // replace with your region
};
const cloudwatchlogs = new AWS.CloudWatchLogs(cloudconfig)
const client = createClient();
// const frequency = 8640000;

async function exportLogToS3(logGroupName) {
    const previousPeriod = await client.get(logGroupName);
    console.log(logGroupName + '이전까지: ', previousPeriod)
    const now = new Date().getTime();
    console.log(logGroupName + '여기까지: ', now)
    let from;
    if(!previousPeriod) {
        from = now -1;                    // 저장된 값이 없으면 현재시각 -1 부터. from에도 now 들어가면 오류 발생
    } else {
        from = Number(previousPeriod); // 기존값은 number로 캐스팅
    }

    const params = {
        destination: 'myelklogbucket', //s3 bucket
        destinationPrefix: 'elklogs',  //s3 prefix
        logGroupName: logGroupName,
        from: from,
        to: now                        // 현시각까지 땡겨옴
    };

    try {
        // S3 로 옮기는 Task 만들기
        await cloudwatchlogs.createExportTask(params).promise();
        return params.to;
    } catch (e) {
        console.log('createExportTask error: ', e)
    }

}

async function main() {
    //1. redis client 가져오기
    client.on('error', (err) => console.log('Redis Client Error', err));
    await client.connect();

    const _sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
    const LogGroupParams = {
        logGroupNamePrefix: '/aws/lambda/cylee-service-dev-'
    };
    try {
        //2. logGroup 메타정보 가져오기
        const res = await cloudwatchlogs.describeLogGroups(LogGroupParams).promise()
        const logGroupList = res.logGroups;

        for (const item of logGroupList) {
            //2-1. 3초 쉬어주기
            await _sleep(3000);
            console.log(`${item.logGroupName} is started.`);
            //3. S3로 옮기기
            const toTimestamp = await exportLogToS3(item.logGroupName);
            //4. Redis 업데이트
            await client.set(item.logGroupName, toTimestamp);
            console.log(`${item.logGroupName} completed to : ${JSON.stringify(toTimestamp)}`);
        }
    } catch (e) {
        console.log('describeLogGroups error: ', e)
    } finally {
        //5. 다 끝나면 레디스 종료
        await client.quit();
    }

}

main();