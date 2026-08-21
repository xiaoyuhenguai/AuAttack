# Free-Attack 预置脚本模板

自由攻击模式（freeattack）的预置验证脚本。**agent 优先用这些模板填参数即用，现场写脚本是最后手段**（须走 `poc run-external` 审批/证据管道）。

## 执行方式

全部脚本通过 `pentest poc run-external` 管道运行：

```
pentest poc run-external <ws> --script tools/freeattack/<script>.py --target <in-scope-url> --approval <P3-approval-id> --task <freeattack-001>
```

凭证通过环境变量传入（避免在命令行暴露）：
```
PENTEST_FA_MYSQL_USER=<user> PENTEST_FA_MYSQL_PASS=<password> \
  pentest poc run-external <ws> --script tools/freeattack/mysql-probe.py ...
```

> 说明：`run-external` 只接受 `-u <url>` 一个位置参数；额外参数走 `PENTEST_FA_*` 环境变量。脚本输出 JSON 到 stdout，exit code 0/1/2/3/4 语义见各脚本。

## 模板清单

| 脚本 | 验证目标 | 必需环境变量 | 只读 |
|---|---|---|---|
| `mysql-probe.py` | MySQL 凭证有效性与库列表 | `PENTEST_FA_MYSQL_USER/PASS`（可选 HOST/PORT/DB） | ✅ |
| `jwt-forge.py` | 泄露密钥伪造 JWT | `PENTEST_FA_JWT_SECRET`（可选 CLAIMS/ALG） | ✅ 本地生成 |
| `session-forge.py` | express-session 密钥伪造 connect.sid | `PENTEST_FA_SESSION_SECRET` | ✅ 本地生成 |
| `qiniu-verify.py` | 七牛 AK/SK 权限（列 bucket） | `PENTEST_FA_QINIU_AK/SK` | ✅ |
| `aliyun-verify.py` | 阿里云 Key 权限（OSS/ECS 只读） | `PENTEST_FA_ALIYUN_AK/SK` | ✅ |
| `id-batch-enum.py` | ID 集合批量枚举（限速） | `PENTEST_FA_ENDPOINT/IDS_CSV`（可选 TOKEN/QUERY_PARAM/DELAY/MS/MAX） | ✅ |
| `smtp-probe.py` | SMTP 凭证验证 | `PENTEST_FA_SMTP_HOST/USER/PASS/PORT` | ✅ |
| `wechat-login-forge.py` | 微信 AppSecret 伪造小程序登录 | `PENTEST_FA_APPID/APPSECRET` | ⚠️ 生成登录凭证 |

## 纪律

1. **只读优先**：所有模板默认只读/本地计算；需写操作的场景（如验证上传）单独走审批
2. **限速**：`id-batch-enum.py` 默认 500ms 间隔 + 50 请求上限，防触发 WAF/限速
3. **第三方边界**：云 AK/SK 只验证存在性与权限，不深入第三方系统
4. **证据**：脚本 stdout 由 `run-external` 捕获为 evidence；agent 仍需用 `pentest_http` 独立重放关键利用（伪造的 JWT/session 必须实测接口 2xx 才算确认）
5. **新模板**：本目录可扩展；新模板须内置参数校验、超时、只读默认、异常处理
