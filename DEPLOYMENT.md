# AutoChatix Backend EC2 Pipeline

This backend is set up for:

GitHub/CodeCommit -> CodePipeline -> CodeBuild -> CodeDeploy -> EC2 -> PM2

## Files Added

- `../buildspec-backend.yml`: builds `AutoChatix-backend`, creates `deploy-info.json`, and publishes a CodeDeploy artifact.
- `appspec.yml`: tells CodeDeploy to copy the backend to `/var/www/autochatix-backend`.
- `scripts/*.sh`: install dependencies, restart PM2, and validate `/health`.
- `/health`: returns the running deploy commit/build info.

## EC2 One-Time Setup

Install Node.js 20, npm, PM2, and the CodeDeploy agent on the EC2 instance.

Recommended app paths for your current EC2:

- App directory: `/home/ubuntu/AutoChatix-backend`
- Shared env file: `/home/ubuntu/autochatix-shared/backend.env`

Put production env values in:

```bash
/home/ubuntu/autochatix-shared/backend.env
```

The deploy script copies this to:

```bash
/home/ubuntu/AutoChatix-backend/.env
```

Your EC2 instance must have an IAM role that allows CodeDeploy access.

## AWS Console Setup

1. Create a CodeDeploy application.
   - Compute platform: `EC2/On-premises`
   - Deployment group: select EC2 by tag, for example `App=autochatix-backend`

2. Create a CodeBuild project.
   - Source: same repo as CodePipeline
   - Buildspec name: `buildspec-backend.yml`
   - Runtime: managed image with Node.js 20

3. Create a CodePipeline.
   - Source: GitHub/CodeCommit branch
   - Build: CodeBuild project above
   - Deploy: CodeDeploy application + deployment group above

## Verify Deploy

After a pipeline run, open:

```bash
https://YOUR_BACKEND_DOMAIN/health
```

or from EC2:

```bash
curl http://127.0.0.1:5005/health
```

You should see the commit and build ID from CodeBuild:

```json
{
  "ok": true,
  "service": "autochatix-backend",
  "deploy": {
    "commit": "...",
    "buildId": "...",
    "builtAt": "..."
  }
}
```

If this commit is not the latest commit from your branch, the backend running on EC2 is not updated.
