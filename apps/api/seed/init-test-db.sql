-- docker compose 처음 실행 때: 테스트용 DB(golf_test)도 만들고 golf 사용자에게 권한
CREATE DATABASE IF NOT EXISTS golf_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL ON golf_test.* TO 'golf'@'%';
