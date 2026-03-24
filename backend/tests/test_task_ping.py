from unittest.mock import Mock, patch


def test_ping_task_endpoint_enqueues_task(client):
      mocked_result = Mock()
      mocked_result.id = "test-task-id"

      with patch("common.views.ping.delay", return_value=mocked_result) as mocked_delay:
          response = client.get("/tasks/ping/")

      assert response.status_code == 202
      assert response.json() == {
          "task_id": "test-task-id",
          "task_name": "common.tasks.ping",
      }
      mocked_delay.assert_called_once_with()






