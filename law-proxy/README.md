# law-proxy

Render용 Flask 중계 서버입니다. `law.go.kr` Open API를 서버에서 호출해 `/api/law-test`로 테스트할 수 있습니다.

## Files

- `app.py`: Flask 앱
- `requirements.txt`: Python dependencies

## Render Deployment

1. Render에서 `New +` > `Web Service`를 선택합니다.
2. 이 저장소를 연결합니다.
3. Root Directory를 `law-proxy`로 설정합니다.
4. 아래 명령을 입력합니다.

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
gunicorn app:app
```

## Environment Variable

Render 서비스의 `Environment` 설정에서 아래 변수를 추가합니다.

- Key: `LAW_OPEN_API_KEY`
- Value: 법제처 Open API의 실제 `OC` 값

## Test Endpoint

배포 후 아래 경로로 확인합니다.

```text
/api/law-test
```

쿼리 파라미터를 바꿀 수도 있습니다.

```text
/api/law-test?query=자동차관리법&target=eflaw
```
